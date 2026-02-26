/**
 * Cloudflare Pages _worker.js
 * Uses Cloudflare Access JWT from cookie for authentication
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      // Try to get email from CF_Access_JwtAssertion cookie first
      const jwtCookie = request.headers.get('Cookie')?.match(/CF_Authorization=([^;]+)/);

      let email = null;

      if (jwtCookie) {
        try {
          // Decode the JWT (it's base64 encoded)
          const jwt = jwtCookie[1];
          const parts = jwt.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            email = payload.email;
          }
        } catch (e) {
          console.error('Failed to parse JWT:', e);
        }
      }

      // Fallback to checking header
      if (!email) {
        email = request.headers.get('CF-Access-User-Email');
      }

      if (!email) {
        return new Response(JSON.stringify({
          error: 'Authentication required',
          message: 'Could not determine user identity'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'https://jobsearch-tracker.kongaiwen.dev',
            'Access-Control-Allow-Credentials': 'true',
          },
        });
      }

      // Health check
      if (url.pathname === '/api/' || url.pathname === '/api') {
        return new Response(JSON.stringify({
          name: '2HJS Tracker API',
          version: '1.0.12',
          status: 'healthy',
          user: email,
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
          // Update admin status if email matches ADMIN_EMAIL
          const isAdmin = email === env.ADMIN_EMAIL;
          if (user.role !== 'ADMIN' && isAdmin) {
            await env.DB.prepare(
              'UPDATE User SET role = ? WHERE id = ?'
            ).bind('ADMIN', user.id).run();
            user.role = 'ADMIN';
          }
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
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': 'https://jobsearch-tracker.kongaiwen.dev',
            },
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
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'https://jobsearch-tracker.kongaiwen.dev',
          },
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
