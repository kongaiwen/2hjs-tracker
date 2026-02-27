/**
 * Outreach Routes
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const userId = c.get('userId');
  const employerId = c.req.query('employerId');
  const contactId = c.req.query('contactId');

  let query = 'SELECT * FROM Outreach WHERE userId = ?';
  const params: any[] = [userId];

  if (employerId) {
    query += ' AND employerId = ?';
    params.push(employerId);
  }
  if (contactId) {
    query += ' AND contactId = ?';
    params.push(contactId);
  }

  query += ' ORDER BY sentAt DESC';

  const outreach = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ outreach: outreach.results });
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO Outreach (id, userId, employerId, contactId, subject, body, wordCount,
                          sentAt, threeB_Date, sevenB_Date, status, encryptedData, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.employerId, body.contactId, body.subject, body.body,
    body.wordCount, body.sentAt, body.threeB_Date, body.sevenB_Date,
    body.status || 'SENT',
    body.encryptedData || null
  ).run();

  const outreach = await c.env.DB.prepare('SELECT * FROM Outreach WHERE id = ?').bind(id).first();
  return c.json({ outreach }, 201);
});

export default app;
