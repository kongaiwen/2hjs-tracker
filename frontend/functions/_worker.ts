/**
 * Cloudflare Pages _worker.ts
 * Handles API routes and passes everything else to static assets
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Types for Cloudflare bindings
type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  ADMIN_EMAIL: string;
  DEV_MODE?: string;
  DEV_EMAIL?: string;
};

type Variables = {
  userId: string;
  userEmail: string;
  tenantId: string;
  isAdmin: boolean;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS for API routes
app.use('/api/*', cors({
  origin: ['https://2hjs-tracker.pages.dev', 'https://jobsearch-tracker.kongaiwen.dev', 'http://localhost:5173'],
  credentials: true,
}));

// Auth middleware for API routes
app.use('/api/*', async (c, next) => {
  const email = c.req.header('CF-Access-User-Email');

  if (!email) {
    // Dev mode bypass for local testing
    if (c.env.DEV_MODE === 'true') {
      c.set('userId', 'dev-user-id');
      c.set('userEmail', c.env.DEV_EMAIL || 'dev@example.com');
      c.set('tenantId', 'dev-tenant-id');
      c.set('isAdmin', false);
      return next();
    }
    return c.json({ error: 'Authentication required', message: 'CF-Access-User-Email header missing' }, 401);
  }

  // Find or create user
  const result = await c.env.DB.prepare(
    'SELECT * FROM User WHERE email = ?'
  ).bind(email).first();

  if (result) {
    const user = result as any;
    await c.env.DB.prepare(
      'UPDATE User SET lastLoginAt = datetime("now") WHERE id = ?'
    ).bind(user.id).run();

    c.set('userId', user.id);
    c.set('userEmail', user.email);
    c.set('tenantId', user.tenantId);
    c.set('isAdmin', user.role === 'ADMIN' || email === c.env.ADMIN_EMAIL);
  } else {
    const id = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const isAdmin = email === c.env.ADMIN_EMAIL;

    await c.env.DB.prepare(`
      INSERT INTO User (id, email, tenantId, role, firstSeenAt, lastLoginAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), datetime('now'))
    `).bind(id, email, tenantId, isAdmin ? 'ADMIN' : 'USER').run();

    c.set('userId', id);
    c.set('userEmail', email);
    c.set('tenantId', tenantId);
    c.set('isAdmin', isAdmin);
  }

  await next();
});

// Health check
app.get('/api/', (c) => {
  return c.json({
    name: '2HJS Tracker API',
    version: '1.0.12',
    status: 'healthy',
  });
});

// Auth /me endpoint
app.get('/api/auth/me', async (c) => {
  const userId = c.get('userId');

  const user = await c.env.DB.prepare(
    'SELECT id, email, tenantId, role, publicKey, keyFingerprint, encryptedData, dataVersion, storageUsed, requestCount, createdAt FROM User WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    hasEncryptionKeys: !!user.publicKey,
    keyFingerprint: user.keyFingerprint,
    encryptedData: user.encryptedData,
    dataVersion: user.dataVersion,
    storageUsed: user.storageUsed,
    requestCount: user.requestCount,
    createdAt: user.createdAt,
  });
});

// Update keys endpoint
app.put('/api/auth/keys', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { publicKey, keyFingerprint } = body;

  if (!publicKey) {
    return c.json({ error: 'publicKey is required' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE User
    SET publicKey = ?,
        keyFingerprint = ?,
        keyCreatedAt = datetime('now'),
        updatedAt = datetime('now')
    WHERE id = ?
  `).bind(publicKey, keyFingerprint || null, userId).run();

  return c.json({ success: true });
});

// IMPORTANT: Do NOT add a catch-all route here
// Let Pages handle static assets (index.html, JS, CSS, etc.)

export default {
  fetch: (request: Request, env: Bindings, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // Pass everything else to Pages for static asset handling
    return env.ASSETS.fetch(request);
  },
};
