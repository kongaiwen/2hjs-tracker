/**
 * Auth Routes
 *
 * Minimal auth endpoints since Cloudflare Access handles authentication.
 * Only /me endpoint is needed to get current user info.
 */

import { Hono } from 'hono';

const app = new Hono();

// Get current user info (authMiddleware is applied globally in index.ts)
app.get('/me', async (c) => {
  const userId = c.get('userId');
  const userEmail = c.get('userEmail');
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  // Get full user record from database
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

// Update public key (after key setup) - authMiddleware is applied globally
app.put('/keys', async (c) => {
  const userId = c.get('userId');

  const body = await c.req.json();
  const { publicKey, keyFingerprint, encryptedData } = body;

  if (!publicKey) {
    return c.json({ error: 'publicKey is required' }, 400);
  }

  // Update user's public key and optionally encrypted data
  await c.env.DB.prepare(`
    UPDATE User
    SET publicKey = ?,
        keyFingerprint = ?,
        keyCreatedAt = datetime('now'),
        ${encryptedData ? 'encryptedData = ?,' : ''}
        updatedAt = datetime('now')
    WHERE id = ?
  `).bind(
    publicKey,
    keyFingerprint || null,
    ...(encryptedData ? [encryptedData] : []),
    userId
  ).run();

  return c.json({ success: true });
});

export default app;
