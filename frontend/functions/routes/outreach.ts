/**
 * Outreach Routes
 */

import { Hono } from 'hono';

const app = new Hono();

// Helper to add business days (skipping weekends: Saturday=6, Sunday=0)
function addBusinessDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  let result = new Date(date);
  let addedDays = 0;

  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sunday (0) and Saturday (6)
      addedDays++;
    }
  }

  return result.toISOString().split('T')[0];
}

// Helper to get effective start date for 3B/7B counting
// If sent at noon or later, counting starts from next business day
function getEffectiveStartDate(sentDate: string): string {
  const date = new Date(sentDate);
  const hour = date.getUTCHours();

  // Convert to Eastern Time (approximate) for noon cutoff
  // UTC-5 in standard time, UTC-4 in daylight time
  const easternHour = hour - 4; // Rough approximation

  const dateOnly = new Date(date);
  dateOnly.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = dateOnly.getDay();

  // If sent on a weekend or at/after noon, start counting from next business day
  if (dayOfWeek === 0 || dayOfWeek === 6 || easternHour >= 12) {
    let next = new Date(dateOnly);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString().split('T')[0];
  }

  return dateOnly.toISOString().split('T')[0];
}

// Calculate 3B date (3 business days from sent date)
function calculate3BDate(sentDate: string): string {
  const effectiveStart = getEffectiveStartDate(sentDate);
  return addBusinessDays(effectiveStart, 3);
}

// Calculate 7B date (7 business days from sent date)
function calculate7BDate(sentDate: string): string {
  const effectiveStart = getEffectiveStartDate(sentDate);
  return addBusinessDays(effectiveStart, 7);
}

// Helper to fetch a single outreach (without JOINs - client resolves names)
async function fetchOutreachById(DB: any, id: string, userId: string) {
  const row = await DB.prepare(`
    SELECT o.* FROM Outreach o
    WHERE o.id = ? AND o.userId = ?
  `).bind(id, userId).first();

  if (!row) return null;

  return {
    ...row,
    contact: row.contactId ? { id: row.contactId } : null,
    employer: row.employerId ? { id: row.employerId } : null,
  };
}

app.get('/', async (c) => {
  const userId = c.get('userId');
  const employerId = c.req.query('employerId');
  const contactId = c.req.query('contactId');

  let query = 'SELECT o.* FROM Outreach o WHERE o.userId = ?';
  const params: any[] = [userId];

  if (employerId) {
    query += ' AND o.employerId = ?';
    params.push(employerId);
  }
  if (contactId) {
    query += ' AND o.contactId = ?';
    params.push(contactId);
  }

  query += ' ORDER BY o.sentAt DESC';

  const outreach = await c.env.DB.prepare(query).bind(...params).all();

  // Return outreach with IDs - client will resolve names from decrypted contacts/employers
  const results = outreach.results.map((row: any) => ({
    ...row,
    // Include minimal nested objects for type compatibility, but with IDs only
    // Names will be resolved client-side from decrypted contacts/employers lists
    contact: row.contactId ? { id: row.contactId } : null,
    employer: row.employerId ? { id: row.employerId } : null,
  }));

  return c.json({ outreach: results });
});

// Get today's reminders (3B/7B routine)
app.get('/today', async (c) => {
  const userId = c.get('userId');
  const today = new Date().toISOString().split('T')[0];

  // 3B reminders: outreach where threeB_Date <= today and status is AWAITING_3B
  const threeB = await c.env.DB.prepare(`
    SELECT o.* FROM Outreach o
    WHERE o.userId = ? AND o.threeB_Date <= ? AND o.status = 'AWAITING_3B'
    ORDER BY o.threeB_Date ASC
  `).bind(userId, today).all();

  // 7B reminders: outreach where sevenB_Date <= today and status is MOVED_ON or AWAITING_7B
  const sevenB = await c.env.DB.prepare(`
    SELECT o.* FROM Outreach o
    WHERE o.userId = ? AND o.sevenB_Date <= ? AND o.status IN ('MOVED_ON', 'AWAITING_7B')
    ORDER BY o.sevenB_Date ASC
  `).bind(userId, today).all();

  // Overdue 3B: threeB_Date < today
  const overdue3B = await c.env.DB.prepare(`
    SELECT o.* FROM Outreach o
    WHERE o.userId = ? AND o.threeB_Date < ? AND o.status = 'AWAITING_3B'
    ORDER BY o.threeB_Date ASC
  `).bind(userId, today).all();

  // Overdue 7B: sevenB_Date < today
  const overdue7B = await c.env.DB.prepare(`
    SELECT o.* FROM Outreach o
    WHERE o.userId = ? AND o.sevenB_Date < ? AND o.status IN ('MOVED_ON', 'AWAITING_7B')
    ORDER BY o.sevenB_Date ASC
  `).bind(userId, today).all();

  const mapRow = (row: any) => ({
    ...row,
    // Client will resolve names from decrypted contacts/employers lists
    contact: row.contactId ? { id: row.contactId } : null,
    employer: row.employerId ? { id: row.employerId } : null,
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

  // Calculate word count from body
  const wordCount = (body.body || '').split(/\s+/).filter((w: string) => w.length > 0).length;

  // Use provided sentAt or current time
  const sentAt = body.sentAt || new Date().toISOString();

  // Calculate 3B and 7B dates using business day logic
  const threeB_Date = calculate3BDate(sentAt);
  const sevenB_Date = calculate7BDate(sentAt);

  await c.env.DB.prepare(`
    INSERT INTO Outreach (id, userId, employerId, contactId, subject, body, wordCount,
                          sentAt, threeB_Date, sevenB_Date, status, encryptedData, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.employerId, body.contactId, body.subject, body.body,
    wordCount, sentAt, threeB_Date, sevenB_Date,
    body.status || 'AWAITING_3B',
    body.encryptedData || null
  ).run();

  const outreach = await fetchOutreachById(c.env.DB, id, userId);
  return c.json({ outreach }, 201);
});

// Get single outreach
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const outreach = await fetchOutreachById(c.env.DB, id, userId);

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

  const outreach = await fetchOutreachById(c.env.DB, id, userId);
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

  const outreach = await fetchOutreachById(c.env.DB, id, userId);
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

  const outreach = await fetchOutreachById(c.env.DB, id, userId);
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

  const outreach = await fetchOutreachById(c.env.DB, id, userId);
  return c.json({ outreach });
});

// Update outreach (for encryption migration)
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  // Verify outreach belongs to user
  const existing = await c.env.DB.prepare(
    'SELECT * FROM Outreach WHERE id = ? AND userId = ?'
  ).bind(id, userId).first() as any;

  if (!existing) {
    return c.json({ error: 'Outreach not found' }, 404);
  }

  // Build dynamic UPDATE query - only update provided fields
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  // Allowable fields to update
  if (body.subject !== undefined) { updates.push('subject = ?'); values.push(body.subject); }
  if (body.body !== undefined) { updates.push('body = ?'); values.push(body.body); }
  if (body.followUpBody !== undefined) { updates.push('followUpBody = ?'); values.push(body.followUpBody); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
  if (body.encryptedData !== undefined) { updates.push('encryptedData = ?'); values.push(body.encryptedData); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.sentAt !== undefined) {
    updates.push('sentAt = ?'); values.push(body.sentAt);
    // Recalculate 3B and 7B dates from new sent date
    updates.push('threeB_Date = ?'); values.push(calculate3BDate(body.sentAt));
    updates.push('sevenB_Date = ?'); values.push(calculate7BDate(body.sentAt));
  }

  // Add updatedAt timestamp
  updates.push('updatedAt = datetime("now")');
  values.push(id, userId);

  if (updates.length > 1) { // More than just updatedAt
    await c.env.DB.prepare(
      `UPDATE Outreach SET ${updates.join(', ')} WHERE id = ? AND userId = ?`
    ).bind(...values).run();
  }

  const outreach = await fetchOutreachById(c.env.DB, id, userId);
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
