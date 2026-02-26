/**
 * Chat Routes
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const messages = await c.env.DB.prepare(
    'SELECT * FROM ChatMessage WHERE userId = ? ORDER BY createdAt DESC LIMIT ?'
  ).bind(userId, limit).all();

  return c.json({ messages: messages.results.reverse() });
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO ChatMessage (id, userId, role, content, metadata, createdAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    id, userId, body.role, body.content,
    body.metadata ? JSON.stringify(body.metadata) : null
  ).run();

  const message = await c.env.DB.prepare('SELECT * FROM ChatMessage WHERE id = ?').bind(id).first();
  return c.json({ message }, 201);
});

app.delete('/', async (c) => {
  const userId = c.get('userId');

  await c.env.DB.prepare(
    'DELETE FROM ChatMessage WHERE userId = ?'
  ).bind(userId).run();

  return c.json({ success: true });
});

export default app;
