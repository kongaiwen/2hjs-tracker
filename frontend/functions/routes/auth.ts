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
    'SELECT id, email, tenantId, role, publicKey, keyFingerprint, wrappedPrivateKey, encryptedData, dataVersion, storageUsed, requestCount, createdAt FROM User WHERE id = ?'
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
    hasWrappedKey: !!user.wrappedPrivateKey,
    publicKey: user.publicKey || null,
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
  const { publicKey, keyFingerprint, encryptedData, wrappedPrivateKey } = body;

  if (!publicKey && !wrappedPrivateKey) {
    return c.json({ error: 'publicKey or wrappedPrivateKey is required' }, 400);
  }

  // If only updating the wrapped key (passphrase set/update from Settings)
  if (!publicKey && wrappedPrivateKey) {
    await c.env.DB.prepare(`
      UPDATE User
      SET wrappedPrivateKey = ?,
          updatedAt = datetime('now')
      WHERE id = ?
    `).bind(wrappedPrivateKey, userId).run();
    return c.json({ success: true });
  }

  // Full key update (initial setup or key regeneration)
  const binds: any[] = [publicKey, keyFingerprint || null];
  let extraCols = '';
  if (encryptedData) {
    extraCols += 'encryptedData = ?,';
    binds.push(encryptedData);
  }
  if (wrappedPrivateKey) {
    extraCols += 'wrappedPrivateKey = ?,';
    binds.push(wrappedPrivateKey);
  }
  binds.push(userId);

  await c.env.DB.prepare(`
    UPDATE User
    SET publicKey = ?,
        keyFingerprint = ?,
        keyCreatedAt = datetime('now'),
        ${extraCols}
        updatedAt = datetime('now')
    WHERE id = ?
  `).bind(...binds).run();

  return c.json({ success: true });
});

// Get the passphrase-wrapped private key blob (opaque ciphertext)
app.get('/keys/wrapped', async (c) => {
  const userId = c.get('userId');

  const user = await c.env.DB.prepare(
    'SELECT wrappedPrivateKey FROM User WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ wrappedPrivateKey: user.wrappedPrivateKey || null });
});

export default app;
