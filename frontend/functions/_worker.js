/**
 * Cloudflare Pages _worker.js
 * Handles API routes and passes everything else to static assets
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      // Get email from Cloudflare Access header
      let email = request.headers.get('CF-Access-User-Email');

      if (!email) {
        // Dev mode bypass for local testing
        if (env.DEV_MODE === 'true') {
          email = env.DEV_EMAIL || 'dev@example.com';
        } else {
          return new Response(JSON.stringify({ error: 'Authentication required', message: 'CF-Access-User-Email header missing' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Health check
      if (url.pathname === '/api/' || url.pathname === '/api') {
        return new Response(JSON.stringify({
          name: '2HJS Tracker API',
          version: '1.0.12',
          status: 'healthy',
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Auth /me endpoint
      if (url.pathname === '/api/auth/me') {
        // Find or create user
        let user = await env.DB.prepare(
          'SELECT * FROM User WHERE email = ?'
        ).bind(email).first();

        if (user) {
          await env.DB.prepare(
            'UPDATE User SET lastLoginAt = datetime("now") WHERE id = ?'
          ).bind(user.id).run();
        } else {
          const id = crypto.randomUUID();
          const tenantId = crypto.randomUUID();
          const isAdmin = email === env.ADMIN_EMAIL;

          await env.DB.prepare(`
            INSERT INTO User (id, email, tenantId, role, firstSeenAt, lastLoginAt, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), datetime('now'))
          `).bind(id, email, tenantId, isAdmin ? 'ADMIN' : 'USER').run();

          user = { id, email, tenantId, role: isAdmin ? 'ADMIN' : 'USER' };
        }

        // Get full user record
        const fullUser = await env.DB.prepare(
          'SELECT id, email, tenantId, role, publicKey, keyFingerprint, encryptedData, dataVersion, storageUsed, requestCount, createdAt FROM User WHERE id = ?'
        ).bind(user.id).first();

        if (!fullUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          id: fullUser.id,
          email: fullUser.email,
          tenantId: fullUser.tenantId,
          role: fullUser.role,
          hasEncryptionKeys: !!fullUser.publicKey,
          keyFingerprint: fullUser.keyFingerprint,
          encryptedData: fullUser.encryptedData,
          dataVersion: fullUser.dataVersion,
          storageUsed: fullUser.storageUsed,
          requestCount: fullUser.requestCount,
          createdAt: fullUser.createdAt,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'https://jobsearch-tracker.kongaiwen.dev',
            'Access-Control-Allow-Credentials': 'true',
            'Vary': 'Origin',
          },
        });
      }

      // Update keys endpoint
      if (url.pathname === '/api/auth/keys' && request.method === 'PUT') {
        const body = await request.json();
        const { publicKey, keyFingerprint } = body;

        if (!publicKey) {
          return new Response(JSON.stringify({ error: 'publicKey is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get user email
        let user = await env.DB.prepare(
          'SELECT * FROM User WHERE email = ?'
        ).bind(email).first();

        if (user) {
          await env.DB.prepare(`
            UPDATE User
            SET publicKey = ?,
                keyFingerprint = ?,
                keyCreatedAt = datetime('now'),
                updatedAt = datetime('now')
            WHERE id = ?
          `).bind(publicKey, keyFingerprint || null, user.id).run();
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Unknown API route
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Pass everything else to Pages for static asset handling
    return env.ASSETS.fetch(request);
  },
};
