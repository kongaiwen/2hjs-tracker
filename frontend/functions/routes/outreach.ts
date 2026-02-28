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

// Get today's reminders (3B/7B routine)
app.get('/today', async (c) => {
  const userId = c.get('userId');
  const today = new Date().toISOString().split('T')[0];

  // 3B reminders: outreach where threeB_Date <= today and status is AWAITING_3B
  const threeB = await c.env.DB.prepare(`
    SELECT o.*, c.name as _contactName, c.segment as _contactSegment,
           e.name as _employerName
    FROM Outreach o
    LEFT JOIN Contact c ON o.contactId = c.id
    LEFT JOIN Employer e ON o.employerId = e.id
    WHERE o.userId = ? AND o.threeB_Date <= ? AND o.status = 'AWAITING_3B'
    ORDER BY o.threeB_Date ASC
  `).bind(userId, today).all();

  // 7B reminders: outreach where sevenB_Date <= today and status is MOVED_ON or AWAITING_7B
  const sevenB = await c.env.DB.prepare(`
    SELECT o.*, c.name as _contactName, c.segment as _contactSegment,
           e.name as _employerName
    FROM Outreach o
    LEFT JOIN Contact c ON o.contactId = c.id
    LEFT JOIN Employer e ON o.employerId = e.id
    WHERE o.userId = ? AND o.sevenB_Date <= ? AND o.status IN ('MOVED_ON', 'AWAITING_7B')
    ORDER BY o.sevenB_Date ASC
  `).bind(userId, today).all();

  // Overdue 3B: threeB_Date < today
  const overdue3B = await c.env.DB.prepare(`
    SELECT o.*, c.name as _contactName, c.segment as _contactSegment,
           e.name as _employerName
    FROM Outreach o
    LEFT JOIN Contact c ON o.contactId = c.id
    LEFT JOIN Employer e ON o.employerId = e.id
    WHERE o.userId = ? AND o.threeB_Date < ? AND o.status = 'AWAITING_3B'
    ORDER BY o.threeB_Date ASC
  `).bind(userId, today).all();

  // Overdue 7B: sevenB_Date < today
  const overdue7B = await c.env.DB.prepare(`
    SELECT o.*, c.name as _contactName, c.segment as _contactSegment,
           e.name as _employerName
    FROM Outreach o
    LEFT JOIN Contact c ON o.contactId = c.id
    LEFT JOIN Employer e ON o.employerId = e.id
    WHERE o.userId = ? AND o.sevenB_Date < ? AND o.status IN ('MOVED_ON', 'AWAITING_7B')
    ORDER BY o.sevenB_Date ASC
  `).bind(userId, today).all();

  const mapRow = (row: any) => ({
    ...row,
    contact: row._contactName ? { id: row.contactId, name: row._contactName, segment: row._contactSegment } : null,
    employer: row._employerName ? { id: row.employerId, name: row._employerName } : null,
    _contactName: undefined, _contactSegment: undefined, _employerName: undefined,
  });

  return c.json({
    threeBReminders: threeB.results.map(mapRow),
    sevenBReminders: sevenB.results.map(mapRow),
    overdue3B: overdue3B.results.map(mapRow),
    overdue7B: overdue7B.results.map(mapRow),
    summary: {
      today3B: threeB.results.length,
      today7B: sevenB.results.length,
      overdue3B: overdue3B.results.length,
      overdue7B: overdue7B.results.length,
      totalActionRequired: threeB.results.length + sevenB.results.length +
                           overdue3B.results.length + overdue7B.results.length,
    },
  });
});

// Get outreach statistics
app.get('/stats/summary', async (c) => {
  const userId = c.get('userId');

  const all = await c.env.DB.prepare(
    'SELECT status, responseType FROM Outreach WHERE userId = ?'
  ).bind(userId).all();

  const records = all.results as any[];
  const totalSent = records.length;
  const totalResponses = records.filter(r => r.responseType).length;
  const totalBoosters = records.filter(r => r.responseType === 'POSITIVE').length;
  const responseRate = totalSent > 0 ? ((totalResponses / totalSent) * 100).toFixed(1) : '0.0';

  const byStatus: Record<string, number> = {};
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  return c.json({
    totalSent,
    totalResponses,
    totalBoosters,
    responseRate,
    byStatus,
  });
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

// Get single outreach
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const outreach = await c.env.DB.prepare(
    'SELECT * FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!outreach) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  return c.json({ outreach });
});

// Record response to outreach
app.post('/:id/response', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare(
    'SELECT * FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).first() as any;

  if (!existing) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE Outreach SET responseAt = ?, responseType = ?, status = 'RESPONDED',
                        updatedAt = datetime('now')
    WHERE id = ? AND userId = ?
  `).bind(body.responseAt, body.responseType, id, userId).run();

  // Determine segment based on response type
  const isBooster = body.responseType === 'POSITIVE' || body.responseType === 'REFERRAL_ONLY';
  const segment = isBooster ? 'BOOSTER' : body.responseType === 'NEGATIVE' ? 'CURMUDGEON' : 'OBLIGATE';

  // Update contact segment if contactId exists
  if (existing.contactId) {
    await c.env.DB.prepare(`
      UPDATE Contact SET segment = ?, updatedAt = datetime('now') WHERE id = ?
    `).bind(segment, existing.contactId).run();
  }

  const outreach = await c.env.DB.prepare('SELECT * FROM Outreach WHERE id = ?').bind(id).first();
  return c.json({ outreach, segment, isBooster });
});

// Record follow-up
app.post('/:id/follow-up', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE Outreach SET followUpSentAt = datetime('now'), followUpBody = ?,
                        status = 'AWAITING_7B', updatedAt = datetime('now')
    WHERE id = ? AND userId = ?
  `).bind(body.body || null, id, userId).run();

  const outreach = await c.env.DB.prepare('SELECT * FROM Outreach WHERE id = ?').bind(id).first();
  return c.json({ outreach });
});

// Mark as moved on (3B expired, try another contact)
app.post('/:id/move-on', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE Outreach SET status = 'MOVED_ON', updatedAt = datetime('now')
    WHERE id = ? AND userId = ?
  `).bind(id, userId).run();

  const outreach = await c.env.DB.prepare('SELECT * FROM Outreach WHERE id = ?').bind(id).first();
  return c.json({ outreach });
});

// Mark as no response (7B expired)
app.post('/:id/no-response', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE Outreach SET status = 'NO_RESPONSE', updatedAt = datetime('now')
    WHERE id = ? AND userId = ?
  `).bind(id, userId).run();

  const outreach = await c.env.DB.prepare('SELECT * FROM Outreach WHERE id = ?').bind(id).first();
  return c.json({ outreach });
});

// Delete outreach
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).run();

  if (!result.success || result.meta.changes === 0) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  return c.json({ success: true });
});

export default app;
