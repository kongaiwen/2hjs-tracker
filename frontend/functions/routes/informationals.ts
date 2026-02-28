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

// Get informational digest (today, this week, overdue, needs prep)
app.get('/digest', async (c) => {
  const userId = c.get('userId');
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // End of this week (Sunday)
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  const weekEnd = endOfWeek.toISOString().split('T')[0];

  const all = await c.env.DB.prepare(`
    SELECT i.*, c.name as _contactName, c.employerId as _contactEmployerId,
           e.name as _employerName
    FROM Informational i
    LEFT JOIN Contact c ON i.contactId = c.id
    LEFT JOIN Employer e ON c.employerId = e.id
    WHERE i.userId = ?
    ORDER BY i.scheduledAt ASC
  `).bind(userId).all();

  const mapRow = (row: any) => ({
    ...row,
    contact: row._contactName ? {
      id: row.contactId, name: row._contactName,
      employer: row._employerName ? { id: row._contactEmployerId, name: row._employerName } : null,
    } : null,
    _contactName: undefined, _contactEmployerId: undefined, _employerName: undefined,
  });

  const records = all.results.map(mapRow) as any[];

  const todayItems = records.filter(r =>
    r.scheduledAt?.startsWith(today) && !r.completedAt
  );
  const thisWeek = records.filter(r => {
    const d = r.scheduledAt?.split('T')[0];
    return d >= today && d <= weekEnd && !r.completedAt;
  });
  const overdue = records.filter(r =>
    r.scheduledAt?.split('T')[0] < today && !r.completedAt
  );
  const needsPreparation = records.filter(r =>
    !r.completedAt && !r.researchNotes && !r.tiaraQuestions &&
    r.scheduledAt?.split('T')[0] >= today
  );

  return c.json({
    today: todayItems,
    thisWeek,
    overdue,
    needsPreparation,
    summary: {
      todayCount: todayItems.length,
      weekCount: thisWeek.length,
      overdueCount: overdue.length,
      needsPrepCount: needsPreparation.length,
    },
  });
});

// Get upcoming informationals
app.get('/upcoming', async (c) => {
  const userId = c.get('userId');
  const days = parseInt(c.req.query('days') || '14');
  const now = new Date();
  const future = new Date(now);
  future.setDate(now.getDate() + days);
  const today = now.toISOString().split('T')[0];
  const futureDate = future.toISOString().split('T')[0];

  const informationals = await c.env.DB.prepare(`
    SELECT * FROM Informational
    WHERE userId = ? AND scheduledAt >= ? AND scheduledAt <= ? AND completedAt IS NULL
    ORDER BY scheduledAt ASC
  `).bind(userId, today, futureDate + 'T23:59:59').all();

  return c.json({ informationals: informationals.results });
});

// Get single informational
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const informational = await c.env.DB.prepare(
    'SELECT * FROM Informational WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!informational) {
    return c.json({ error: 'Informational not found' }, 404);
  }

  return c.json({ informational });
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO Informational (id, userId, contactId, scheduledAt, duration, method,
                               encryptedData, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.contactId, body.scheduledAt, body.duration || 30,
    body.method || 'PHONE',
    body.encryptedData || null
  ).run();

  const informational = await c.env.DB.prepare('SELECT * FROM Informational WHERE id = ?').bind(id).first();
  return c.json({ informational }, 201);
});

// Update informational
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM Informational WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Informational not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  const allowedFields = [
    'contactId', 'scheduledAt', 'duration', 'method',
    'researchNotes', 'bigFourAnswers', 'tiaraQuestions',
    'completedAt', 'outcome', 'referralName', 'referralContact',
    'nextSteps', 'calendarEventId', 'encryptedData',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push("updatedAt = datetime('now')");
  values.push(id, userId);

  await c.env.DB.prepare(`
    UPDATE Informational SET ${updates.join(', ')} WHERE id = ? AND userId = ?
  `).bind(...values).run();

  const informational = await c.env.DB.prepare('SELECT * FROM Informational WHERE id = ?').bind(id).first();
  return c.json({ informational });
});

// Complete informational
app.post('/:id/complete', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM Informational WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Informational not found' }, 404);
  }

  const updates: string[] = [
    "completedAt = datetime('now')",
    "updatedAt = datetime('now')",
  ];
  const values: any[] = [];

  if (body.outcome) {
    updates.push('outcome = ?');
    values.push(body.outcome);
  }
  if (body.referralName !== undefined) {
    updates.push('referralName = ?');
    values.push(body.referralName);
  }
  if (body.referralContact !== undefined) {
    updates.push('referralContact = ?');
    values.push(body.referralContact);
  }
  if (body.nextSteps !== undefined) {
    updates.push('nextSteps = ?');
    values.push(body.nextSteps);
  }
  if (body.encryptedData !== undefined) {
    updates.push('encryptedData = ?');
    values.push(body.encryptedData);
  }

  values.push(id, userId);

  await c.env.DB.prepare(`
    UPDATE Informational SET ${updates.join(', ')} WHERE id = ? AND userId = ?
  `).bind(...values).run();

  const informational = await c.env.DB.prepare('SELECT * FROM Informational WHERE id = ?').bind(id).first();
  return c.json({ informational });
});

// Delete informational
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM Informational WHERE id = ? AND userId = ?'
  ).bind(id, userId).run();

  if (!result.success || result.meta.changes === 0) {
    return c.json({ error: 'Informational not found' }, 404);
  }

  return c.json({ success: true });
});

export default app;
