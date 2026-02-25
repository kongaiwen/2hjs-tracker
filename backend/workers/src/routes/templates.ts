/**
 * Email Template Routes
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const userId = c.get('userId');

  const templates = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE userId IS NULL OR userId = ? ORDER BY isDefault DESC, name ASC'
  ).bind(userId).all();

  return c.json({ templates: templates.results });
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO EmailTemplate (id, userId, name, type, subject, body, variables, wordCount, isDefault, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.name, body.type, body.subject, body.body,
    JSON.stringify(body.variables || []), body.wordCount,
    body.isDefault ? 1 : 0
  ).run();

  const template = await c.env.DB.prepare('SELECT * FROM EmailTemplate WHERE id = ?').bind(id).first();
  return c.json({ template }, 201);
});

export default app;
