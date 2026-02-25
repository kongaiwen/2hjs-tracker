/**
 * Settings Routes
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const userId = c.get('userId');

  let settings = await c.env.DB.prepare(
    'SELECT * FROM Settings WHERE userId = ?'
  ).bind(userId).first();

  // Create default settings if not exist
  if (!settings) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO Settings (id, userId, defaultTimezone, workdayStart, workdayEnd, createdAt, updatedAt)
      VALUES (?, ?, 'America/New_York', '09:00', '17:00', datetime('now'), datetime('now'))
    `).bind(id, userId).run();

    settings = await c.env.DB.prepare('SELECT * FROM Settings WHERE id = ?').bind(id).first();
  }

  // Remove sensitive fields
  const { googleAccessToken, googleRefreshToken, ...safeSettings } = settings as any;

  return c.json({ settings: safeSettings });
});

app.put('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  let settings = await c.env.DB.prepare(
    'SELECT id FROM Settings WHERE userId = ?'
  ).bind(userId).first();

  if (!settings) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO Settings (id, userId, createdAt, updatedAt)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).bind(id, userId).run();
    settings = { id };
  }

  const updates: string[] = [];
  const values: any[] = [];

  const allowedFields = ['defaultTimezone', 'workdayStart', 'workdayEnd',
    'preferredCalendarId', 'claudeApiKey'];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field] || null);
    }
  }

  updates.push('updatedAt = datetime(\'now\')');
  values.push((settings as any).id);

  await c.env.DB.prepare(`UPDATE Settings SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run();

  const updated = await c.env.DB.prepare('SELECT * FROM Settings WHERE id = ?')
    .bind((settings as any).id).first();

  const { googleAccessToken, googleRefreshToken, ...safeSettings } = updated as any;

  return c.json({ settings: safeSettings });
});

export default app;
