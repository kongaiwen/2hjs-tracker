/**
 * Usage Tracking Middleware
 *
 * Tracks all API requests for usage monitoring and rate limiting.
 * Stores metrics in UsageMetrics table and updates User.requestCount.
 */

import { Context, Next, MiddlewareHandler } from 'hono';

interface UsageEnv {
  DB: D1Database;
  KV: KVNamespace;
}

interface UsageMetrics {
  userId: string;
  requestCount: number;
  storageUsed: number;
  lastRequestAt: string | null;
}

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const RATE_LIMIT_REQUESTS = 1000; // Requests per hour

export const usageMiddleware: MiddlewareHandler<{
  Bindings: UsageEnv;
  Variables: {
    userId: string;
  };
}> = async (c, next) => {
  const start = Date.now();
  const userId = c.get('userId');
  const path = c.req.path;
  const method = c.req.method();

  // Skip tracking for non-API routes and when userId is not set
  if (!path.startsWith('/api/') || !userId) {
    await next();
    return;
  }

  // Process the request first
  await next();

  // Calculate duration
  const duration = Date.now() - start;

  // Get current usage from KV cache (if available)
  const cacheKey = `usage:${userId}`;
  let usage: UsageMetrics | null = null;

  try {
    const cached = await c.env.KV.get(cacheKey, 'json');
    usage = cached as UsageMetrics | null;
  } catch {
    // KV read failed, continue without cache
  }

  // Increment request count
  const requestCount = (usage?.requestCount || 0) + 1;

  // Update cache (fire and forget)
  c.env.KV.put(cacheKey, JSON.stringify({
    ...usage,
    requestCount,
    lastRequestAt: new Date().toISOString(),
  }), { expirationTtl: 3600 }).catch(() => {});

  // Track usage metrics in D1 (async, don't block response)
  c.env.DB.prepare(`
    INSERT INTO UsageMetrics (id, userId, metricType, value, timestamp)
    VALUES (?, ?, 'API_REQUEST', 1, datetime('now'))
  `).bind(crypto.randomUUID(), userId).run().catch(() => {});

  // Update user's request count
  c.env.DB.prepare(`
    UPDATE User
    SET requestCount = requestCount + 1,
        lastRequestAt = datetime('now')
    WHERE id = ?
  `).bind(userId).run().catch(() => {});

  // Log slow requests
  if (duration > 1000) {
    console.warn(`Slow request: ${method} ${path} - ${duration}ms`);
  }
};

/**
 * Rate limiting middleware using KV
 */
export const rateLimitMiddleware: MiddlewareHandler<{
  Bindings: UsageEnv;
  Variables: {
    userId: string;
  };
}> = async (c, next) => {
  const userId = c.get('userId');
  if (!userId) {
    await next();
    return;
  }

  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
  const rateLimitKey = `ratelimit:${userId}:${windowStart}`;

  // Get current count from KV
  const current = await c.env.KV.get(rateLimitKey);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= RATE_LIMIT_REQUESTS) {
    return c.json({
      error: 'Rate limit exceeded',
      message: `Maximum ${RATE_LIMIT_REQUESTS} requests per hour`,
      retryAfter: new Date(windowStart + RATE_LIMIT_WINDOW).toISOString(),
    }, 429);
  }

  // Increment counter (fire and forget)
  c.env.KV.put(rateLimitKey, String(count + 1), {
    expirationTtl: Math.floor(RATE_LIMIT_WINDOW / 1000),
  }).catch(() => {});

  // Add rate limit headers
  c.header('X-RateLimit-Limit', String(RATE_LIMIT_REQUESTS));
  c.header('X-RateLimit-Remaining', String(RATE_LIMIT_REQUESTS - count - 1));
  c.header('X-RateLimit-Reset', new Date(windowStart + RATE_LIMIT_WINDOW).toISOString());

  await next();
};
