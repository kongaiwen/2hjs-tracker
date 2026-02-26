/**
 * Informational Interview Routes
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const userId = c.get('userId');

  const informationals = await c.env.DB.prepare(
    'SELECT * FROM Informational WHERE userId = ? ORDER BY scheduledAt DESC'
  ).bind(userId).all();

  return c.json({ informationals: informationals.results });
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO Informational (id, userId, contactId, scheduledAt, duration, method,
                               createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.contactId, body.scheduledAt, body.duration || 30,
    body.method || 'PHONE'
  ).run();

  const informational = await c.env.DB.prepare('SELECT * FROM Informational WHERE id = ?').bind(id).first();
  return c.json({ informational }, 201);
});

export default app;
