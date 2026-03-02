/**
 * Authentication Middleware for Cloudflare Access
 *
 * Extracts user email from the CF_Authorization JWT cookie set by
 * Cloudflare Access (Zero Trust) when a user is authenticated via Google SSO.
 * Falls back to CF-Access-User-Email header if available.
 *
 * On first login, a new User record is created automatically.
 */

import { Context, Next, MiddlewareHandler } from 'hono';

interface AuthEnv {
  DB: D1Database;
  ADMIN_EMAIL: string;
  DEV_MODE?: string;  // Set to 'true' to bypass auth for local development
  DEV_EMAIL?: string; // Email to use in dev mode (default: dev@example.com)
}

interface User {
  id: string;
  email: string;
  tenantId: string;
  role: 'USER' | 'ADMIN';
  publicKey: string | null;
  encryptedData: string | null;
  dataVersion: number;
}

/**
 * Extract email from CF_Authorization JWT cookie
 */
function getEmailFromJwt(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/CF_Authorization=([^;]+)/);
  if (!match) return null;
  try {
    const parts = match[1].split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      return payload.email || null;
    }
  } catch {
    // Invalid JWT
  }
  return null;
}

export const authMiddleware: MiddlewareHandler<{
  Bindings: AuthEnv;
  Variables: {
    userId: string;
    userEmail: string;
    tenantId: string;
    isAdmin: boolean;
  };
}> = async (c, next) => {
  // Skip auth for OAuth callback (called by Google, not by user)
  if (c.req.path === '/api/google/callback') {
    await next();
    return;
  }

  // Try CF_Authorization JWT cookie first, then fall back to header
  let email = getEmailFromJwt(c.req.header('Cookie'))
    || c.req.header('CF-Access-User-Email')
    || null;

  // Dev mode: allow local testing without Cloudflare Access
  if (!email && c.env.DEV_MODE === 'true') {
    email = c.env.DEV_EMAIL || 'dev@example.com';
  }

  if (!email) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Try to find existing user
  let user: User | null = null;

  const result = await c.env.DB.prepare(
    'SELECT * FROM User WHERE email = ?'
  ).bind(email).first();

  if (result) {
    user = result as unknown as User;
  }

  // Create new user on first login
  if (!user) {
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

    // Continue to next middleware
    await next();
    return;
  }

  // Update last login time
  await c.env.DB.prepare(
    'UPDATE User SET lastLoginAt = datetime("now") WHERE id = ?'
  ).bind(user.id).run();

  // Set context variables
  const isAdmin = user.role === 'ADMIN' || email === c.env.ADMIN_EMAIL;
  c.set('userId', user.id);
  c.set('userEmail', user.email);
  c.set('tenantId', user.tenantId);
  c.set('isAdmin', isAdmin);

  await next();
};

/**
 * Admin-only middleware
 * Checks if the authenticated user has admin role
 */
export const adminMiddleware: MiddlewareHandler<{
  Bindings: AuthEnv;
  Variables: {
    userId: string;
    userEmail: string;
    isAdmin: boolean;
  };
}> = async (c, next) => {
  const isAdmin = c.get('isAdmin');
  const email = c.get('userEmail');

  if (!isAdmin) {
    return c.json({
      error: 'Forbidden',
      message: 'Admin access required'
    }, 403);
  }

  await next();
};
