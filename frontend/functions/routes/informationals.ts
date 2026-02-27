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

export default app;
