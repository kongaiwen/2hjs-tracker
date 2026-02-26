/**
 * Cloudflare Pages _worker.js
 * Complete API with all routes using Cloudflare Access JWT authentication
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      // Get email from CF_Access_JwtAssertion cookie
      const jwtCookie = request.headers.get('Cookie')?.match(/CF_Authorization=([^;]+)/);
      let email = null;

      if (jwtCookie) {
        try {
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

      if (!email) {
        return new Response(JSON.stringify({
          error: 'Authentication required'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'https://jobsearch-tracker.kongaiwen.dev',
          },
        });
      }

      // Get or create user
      let user = await env.DB.prepare(
        'SELECT * FROM User WHERE email = ?'
      ).bind(email).first();

      if (!user) {
        const id = crypto.randomUUID();
        const tenantId = crypto.randomUUID();
        const isAdmin = email === env.ADMIN_EMAIL;

        await env.DB.prepare(`
          INSERT INTO User (id, email, tenantId, role, firstSeenAt, lastLoginAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), datetime('now'))
        `).bind(id, email, tenantId, isAdmin ? 'ADMIN' : 'USER').run();

        user = { id, email, tenantId, role: isAdmin ? 'ADMIN' : 'USER' };
      }

      const userId = user.id;
      const corsHeaders = {
        'Access-Control-Allow-Origin': 'https://jobsearch-tracker.kongaiwen.dev',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      };

      // Handle OPTIONS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // ==================== AUTH ROUTES ====================
      if (url.pathname === '/api/' || url.pathname === '/api') {
        return new Response(JSON.stringify({
          name: '2HJS Tracker API',
          version: '1.0.12',
          status: 'healthy',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/auth/me') {
        const fullUser = await env.DB.prepare(
          'SELECT id, email, tenantId, role, publicKey, keyFingerprint, encryptedData, dataVersion, storageUsed, requestCount, createdAt FROM User WHERE id = ?'
        ).bind(userId).first();

        return new Response(JSON.stringify(fullUser || {}), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/auth/keys' && request.method === 'PUT') {
        const body = await request.json();
        const { publicKey, keyFingerprint, encryptedData } = body;

        await env.DB.prepare(`
          UPDATE User
          SET publicKey = ?, keyFingerprint = ?, encryptedData = ?, updatedAt = datetime('now')
          WHERE id = ?
        `).bind(publicKey, keyFingerprint || null, encryptedData || null, userId).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // DEBUG: List all users (admin only, for debugging data migration)
      if (url.pathname === '/api/debug/users' && request.method === 'GET') {
        const users = await env.DB.prepare(
          'SELECT id, email, role, publicKey, keyFingerprint, createdAt, storageUsed FROM User ORDER BY createdAt DESC'
        ).all();

        // Count data per user
        const result = [];
        for (const user of users.results || []) {
          const employerCount = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM Employer WHERE userId = ?'
          ).bind(user.id).first();
          const contactCount = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM Contact WHERE userId = ?'
          ).bind(user.id).first();
          const outreachCount = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM Outreach WHERE userId = ?'
          ).bind(user.id).first();

          result.push({
            ...user,
            employerCount: employerCount?.count || 0,
            contactCount: contactCount?.count || 0,
            outreachCount: outreachCount?.count || 0,
          });
        }

        return new Response(JSON.stringify(result, null, 2), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // DEBUG: Transfer data from one user to another
      if (url.pathname === '/api/debug/transfer-data' && request.method === 'POST') {
        const body = await request.json();
        const { fromUserId, toUserId } = body;

        if (!fromUserId || !toUserId) {
          return new Response(JSON.stringify({ error: 'fromUserId and toUserId required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Update all records
        await env.DB.prepare('UPDATE Employer SET userId = ? WHERE userId = ?').bind(toUserId, fromUserId).run();
        await env.DB.prepare('UPDATE Contact SET userId = ? WHERE userId = ?').bind(toUserId, fromUserId).run();
        await env.DB.prepare('UPDATE Outreach SET userId = ? WHERE userId = ?').bind(toUserId, fromUserId).run();
        await env.DB.prepare('UPDATE Informational SET userId = ? WHERE userId = ?').bind(toUserId, fromUserId).run();
        await env.DB.prepare('UPDATE EmailTemplate SET userId = ? WHERE userId = ?').bind(toUserId, fromUserId).run();
        await env.DB.prepare('UPDATE Settings SET userId = ? WHERE userId = ?').bind(toUserId, fromUserId).run();

        return new Response(JSON.stringify({ success: true, message: `Data transferred from ${fromUserId} to ${toUserId}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== EMPLOYERS ====================
      if (url.pathname === '/api/employers' && request.method === 'GET') {
        const employers = await env.DB.prepare(
          'SELECT * FROM Employer WHERE userId = ? ORDER BY createdAt DESC'
        ).bind(userId).all();
        return new Response(JSON.stringify(employers.results || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname.match(/^\/api\/employers\/[^/]+$/) && request.method === 'GET') {
        const id = url.pathname.split('/').pop();
        const employer = await env.DB.prepare(
          'SELECT * FROM Employer WHERE id = ? AND userId = ?'
        ).bind(id, userId).first();
        return new Response(JSON.stringify(employer), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/employers' && request.method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO Employer (id, userId, name, website, industry, location, notes,
                                advocacy, motivation, posting, status, isNetworkOrg, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          id, userId, body.name, body.website || null, body.industry || null,
          body.location || null, body.notes || null,
          body.advocacy ? 1 : 0, body.motivation ?? 0, body.posting ?? 1,
          body.status || 'ACTIVE', body.isNetworkOrg ? 1 : 0
        ).run();

        const employer = await env.DB.prepare('SELECT * FROM Employer WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(employer), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname.match(/^\/api\/employers\/[^/]+$/) && request.method === 'PUT') {
        const id = url.pathname.split('/').pop();
        const body = await request.json();

        const existing = await env.DB.prepare(
          'SELECT id FROM Employer WHERE id = ? AND userId = ?'
        ).bind(id, userId).first();

        if (!existing) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const updates = [];
        const values = [];
        if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
        if (body.website !== undefined) { updates.push('website = ?'); values.push(body.website); }
        if (body.industry !== undefined) { updates.push('industry = ?'); values.push(body.industry); }
        if (body.location !== undefined) { updates.push('location = ?'); values.push(body.location); }
        if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
        if (body.advocacy !== undefined) { updates.push('advocacy = ?'); values.push(body.advocacy ? 1 : 0); }
        if (body.motivation !== undefined) { updates.push('motivation = ?'); values.push(body.motivation); }
        if (body.posting !== undefined) { updates.push('posting = ?'); values.push(body.posting); }
        if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
        if (body.isNetworkOrg !== undefined) { updates.push('isNetworkOrg = ?'); values.push(body.isNetworkOrg ? 1 : 0); }
        updates.push('updatedAt = datetime(\'now\')');
        values.push(id, userId);

        await env.DB.prepare(`UPDATE Employer SET ${updates.join(', ')} WHERE id = ? AND userId = ?`)
          .bind(...values).run();

        const employer = await env.DB.prepare('SELECT * FROM Employer WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(employer), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname.match(/^\/api\/employers\/[^/]+$/) && request.method === 'DELETE') {
        const id = url.pathname.split('/').pop();
        await env.DB.prepare('DELETE FROM Employer WHERE id = ? AND userId = ?').bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== CONTACTS ====================
      if (url.pathname === '/api/contacts' && request.method === 'GET') {
        const employers = await env.DB.prepare(
          'SELECT * FROM Contact WHERE userId = ? ORDER BY createdAt DESC'
        ).bind(userId).all();
        return new Response(JSON.stringify(employers.results || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/contacts' && request.method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO Contact (id, employerId, userId, name, title, email, linkedInUrl, phone,
                                isFunctionallyRelevant, isAlumni, levelAboveTarget,
                                isInternallyPromoted, hasUniqueName, contactMethod,
                                segment, priority, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          id, body.employerId, userId, body.name, body.title || null, body.email || null,
          body.linkedInUrl || null, body.phone || null, body.isFunctionallyRelevant ? 1 : 0,
          body.isAlumni ? 1 : 0, body.levelAboveTarget || 0, body.isInternallyPromoted ? 1 : 0,
          body.hasUniqueName ? 1 : 0, body.contactMethod || null, body.segment || 'UNKNOWN',
          body.priority || 1, body.notes || null
        ).run();

        const contact = await env.DB.prepare('SELECT * FROM Contact WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(contact), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname.match(/^\/api\/contacts\/[^/]+$/) && request.method === 'PUT') {
        const id = url.pathname.split('/').pop();
        const body = await request.json();

        await env.DB.prepare(`
          UPDATE Contact SET name = ?, title = ?, email = ?, phone = ?,
                          linkedInUrl = ?, notes = ?, updatedAt = datetime('now')
          WHERE id = ? AND userId = ?
        `).bind(
          body.name, body.title || null, body.email || null, body.phone || null,
          body.linkedInUrl || null, body.notes || null, id, userId
        ).run();

        const contact = await env.DB.prepare('SELECT * FROM Contact WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(contact), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname.match(/^\/api\/contacts\/[^/]+$/) && request.method === 'DELETE') {
        const id = url.pathname.split('/').pop();
        await env.DB.prepare('DELETE FROM Contact WHERE id = ? AND userId = ?').bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== TEMPLATES ====================
      if (url.pathname === '/api/templates' && request.method === 'GET') {
        const templates = await env.DB.prepare(
          'SELECT * FROM EmailTemplate WHERE userId = ? ORDER BY createdAt DESC'
        ).bind(userId).all();
        return new Response(JSON.stringify(templates.results || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/templates' && request.method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO EmailTemplate (id, userId, name, type, subject, body, variables, wordCount, isDefault, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          id, userId, body.name, body.type, body.subject, body.body,
          JSON.stringify(body.variables || []), body.wordCount, body.isDefault ? 1 : 0
        ).run();

        const template = await env.DB.prepare('SELECT * FROM EmailTemplate WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(template), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== SETTINGS ====================
      if (url.pathname === '/api/settings' && request.method === 'GET') {
        let settings = await env.DB.prepare(
          'SELECT * FROM Settings WHERE userId = ?'
        ).bind(userId).first();

        // Create default settings if not exists
        if (!settings) {
          await env.DB.prepare(`
            INSERT INTO Settings (id, userId, defaultTimezone, workdayStart, workdayEnd, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(crypto.randomUUID(), userId, 'America/New_York', '09:00', '17:00').run();

          settings = await env.DB.prepare('SELECT * FROM Settings WHERE userId = ?').bind(userId).first();
        }

        return new Response(JSON.stringify(settings), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/settings' && request.method === 'PUT') {
        const body = await request.json();

        await env.DB.prepare(`
          UPDATE Settings SET defaultTimezone = ?, workdayStart = ?, workdayEnd = ?, updatedAt = datetime('now')
          WHERE userId = ?
        `).bind(
          body.defaultTimezone || 'America/New_York',
          body.workdayStart || '09:00',
          body.workdayEnd || '17:00',
          userId
        ).run();

        const settings = await env.DB.prepare('SELECT * FROM Settings WHERE userId = ?').bind(userId).first();
        return new Response(JSON.stringify(settings), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== OUTREACH ====================
      if (url.pathname === '/api/outreach' && request.method === 'GET') {
        const outreach = await env.DB.prepare(
          'SELECT * FROM Outreach WHERE userId = ? ORDER BY createdAt DESC'
        ).bind(userId).all();
        return new Response(JSON.stringify(outreach.results || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/outreach' && request.method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO Outreach (id, employerId, contactId, userId, subject, body, wordCount,
                              sentAt, threeB_Date, sevenB_Date, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          id, body.employerId, body.contactId, userId, body.subject, body.body, body.wordCount,
          body.sentAt, body.threeB_Date, body.sevenB_Date, body.status || 'SENT'
        ).run();

        const outreach = await env.DB.prepare('SELECT * FROM Outreach WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(outreach), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ==================== INFORMATIONALS ====================
      if (url.pathname === '/api/informationals' && request.method === 'GET') {
        const informationals = await env.DB.prepare(
          'SELECT * FROM Informational WHERE userId = ? ORDER BY scheduledAt ASC'
        ).bind(userId).all();
        return new Response(JSON.stringify(informationals.results || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/informationals' && request.method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO Informational (id, contactId, userId, scheduledAt, duration, method, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(id, body.contactId, userId, body.scheduledAt, body.duration || 30, body.method || 'PHONE').run();

        const informational = await env.DB.prepare('SELECT * FROM Informational WHERE id = ?').bind(id).first();
        return new Response(JSON.stringify(informational), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Unknown route
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Pass everything else to Pages for static asset handling
    return env.ASSETS.fetch(request);
  },
};
