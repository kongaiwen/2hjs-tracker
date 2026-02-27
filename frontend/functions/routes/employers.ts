/**
 * Employer Routes
 *
 * CRUD operations for employer records.
 * When E2E encryption is enabled, stores encrypted data blobs.
 */

import { Hono } from 'hono';
import { z } from 'zod';

const employerSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().nullable().optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  advocacy: z.boolean().optional(),
  motivation: z.number().int().min(0).max(3).optional(),
  posting: z.number().int().min(1).max(3).optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'RULED_OUT', 'OFFER_RECEIVED']).optional(),
  isNetworkOrg: z.boolean().optional(),
});

const app = new Hono();

// Get all employers
app.get('/', async (c) => {
  const userId = c.get('userId');

  const employers = await c.env.DB.prepare(
    'SELECT * FROM Employer WHERE userId = ? ORDER BY displayOrder ASC, createdAt DESC'
  ).bind(userId).all();

  return c.json({ employers: employers.results });
});

// Get single employer
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const employer = await c.env.DB.prepare(
    'SELECT * FROM Employer WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!employer) {
    return c.json({ error: 'Employer not found' }, 404);
  }

  return c.json({ employer });
});

// Create employer
app.post('/', async (c) => {
  const userId = c.get('userId');

  try {
    const body = await c.req.json();
    const data = employerSchema.parse(body);

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO Employer (id, userId, name, website, industry, location, notes,
                            advocacy, motivation, posting, status, isNetworkOrg, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      id,
      userId,
      data.name,
      data.website || null,
      data.industry || null,
      data.location || null,
      data.notes || null,
      data.advocacy ? 1 : 0,
      data.motivation ?? 0,
      data.posting ?? 1,
      data.status || 'ACTIVE',
      data.isNetworkOrg ? 1 : 0
    ).run();

    const employer = await c.env.DB.prepare(
      'SELECT * FROM Employer WHERE id = ?'
    ).bind(id).first();

    return c.json({ employer }, 201);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Invalid request data' }, 400);
  }
});

// Update employer
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  try {
    const body = await c.req.json();
    const data = employerSchema.partial().parse(body);

    // Check ownership
    const existing = await c.env.DB.prepare(
      'SELECT id FROM Employer WHERE id = ? AND userId = ?'
    ).bind(id, userId).first();

    if (!existing) {
      return c.json({ error: 'Employer not found' }, 404);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.website !== undefined) {
      updates.push('website = ?');
      values.push(data.website || null);
    }
    if (data.industry !== undefined) {
      updates.push('industry = ?');
      values.push(data.industry || null);
    }
    if (data.location !== undefined) {
      updates.push('location = ?');
      values.push(data.location || null);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes || null);
    }
    if (data.advocacy !== undefined) {
      updates.push('advocacy = ?');
      values.push(data.advocacy ? 1 : 0);
    }
    if (data.motivation !== undefined) {
      updates.push('motivation = ?');
      values.push(data.motivation);
    }
    if (data.posting !== undefined) {
      updates.push('posting = ?');
      values.push(data.posting);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.isNetworkOrg !== undefined) {
      updates.push('isNetworkOrg = ?');
      values.push(data.isNetworkOrg ? 1 : 0);
    }

    updates.push('updatedAt = datetime(\'now\')');
    values.push(id, userId);

    await c.env.DB.prepare(`
      UPDATE Employer SET ${updates.join(', ')} WHERE id = ? AND userId = ?
    `).bind(...values).run();

    const employer = await c.env.DB.prepare(
      'SELECT * FROM Employer WHERE id = ?'
    ).bind(id).first();

    return c.json({ employer });
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Invalid request data' }, 400);
  }
});

// Delete employer
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM Employer WHERE id = ? AND userId = ?'
  ).bind(id, userId).run();

  if (!result.success || result.meta.changes === 0) {
    return c.json({ error: 'Employer not found' }, 404);
  }

  return c.json({ success: true });
});

// Toggle employer lock status
app.patch('/:id/lock', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  try {
    const body = await c.req.json();
    const { isLocked } = body;

    // Check ownership
    const existing = await c.env.DB.prepare(
      'SELECT id FROM Employer WHERE id = ? AND userId = ?'
    ).bind(id, userId).first();

    if (!existing) {
      return c.json({ error: 'Employer not found' }, 404);
    }

    await c.env.DB.prepare(`
      UPDATE Employer
      SET isLocked = ?, updatedAt = datetime('now')
      WHERE id = ? AND userId = ?
    `).bind(isLocked ? 1 : 0, id, userId).run();

    const employer = await c.env.DB.prepare(
      'SELECT * FROM Employer WHERE id = ?'
    ).bind(id).first();

    return c.json({ employer, success: true });
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Invalid request data' }, 400);
  }
});

// Reorder employers (for drag-and-drop)
app.post('/reorder', async (c) => {
  const userId = c.get('userId');

  try {
    const body = await c.req.json();
    const { employerIds } = body;

    if (!Array.isArray(employerIds)) {
      return c.json({ error: 'employerIds must be an array' }, 400);
    }

    // Update displayOrder for each employer
    for (let i = 0; i < employerIds.length; i++) {
      await c.env.DB.prepare(`
        UPDATE Employer
        SET displayOrder = ?, updatedAt = datetime('now')
        WHERE id = ? AND userId = ?
      `).bind(i, employerIds[i], userId).run();
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Invalid request data' }, 400);
  }
});

// Auto-sort employers by LAMP score (preserving locked positions)
app.post('/resort', async (c) => {
  const userId = c.get('userId');

  try {
    // Get all employers with current order
    const employers = await c.env.DB.prepare(`
      SELECT * FROM Employer WHERE userId = ? ORDER BY displayOrder
    `).bind(userId).all();

    const allEmployers = employers.results;

    // Separate locked and unlocked
    const locked = allEmployers.filter((e: any) => e.isLocked);
    const unlocked = allEmployers.filter((e: any) => !e.isLocked);

    // Sort unlocked by LAMP score (motivation * 100 + posting * 10 + advocacy)
    unlocked.sort((a: any, b: any) => {
      const scoreA = a.motivation * 100 + a.posting * 10 + (a.advocacy ? 1 : 0);
      const scoreB = b.motivation * 100 + b.posting * 10 + (b.advocacy ? 1 : 0);
      return scoreB - scoreA; // Descending (highest first)
    });

    // Merge: insert locked employers back at their original positions
    const sorted: any[] = [];
    let lockedIdx = 0;
    let unlockedIdx = 0;

    for (let i = 0; i < allEmployers.length; i++) {
      const originalEmployer = allEmployers[i];
      if (originalEmployer.isLocked) {
        sorted.push(locked[lockedIdx++]);
      } else {
        sorted.push(unlocked[unlockedIdx++]);
      }
    }

    // Update displayOrder for all
    for (let i = 0; i < sorted.length; i++) {
      await c.env.DB.prepare(`
        UPDATE Employer SET displayOrder = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).bind(i, sorted[i].id).run();
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 500);
    }
    return c.json({ error: 'Auto-sort failed' }, 500);
  }
});

export default app;
