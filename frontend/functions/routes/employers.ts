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
    'SELECT * FROM Employer WHERE userId = ? ORDER BY createdAt DESC'
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

export default app;
