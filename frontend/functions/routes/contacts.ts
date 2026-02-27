/**
 * Contact Routes
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  const userId = c.get('userId');
  const employerId = c.req.query('employerId');

  let query = `
    SELECT c.*, e.id as _employerId, e.name as _employerName
    FROM Contact c
    LEFT JOIN Employer e ON c.employerId = e.id
    WHERE c.userId = ?
  `;
  const params: any[] = [userId];

  if (employerId) {
    query += ' AND c.employerId = ?';
    params.push(employerId);
  }

  query += ' ORDER BY c.priority ASC, c.createdAt DESC';

  const contacts = await c.env.DB.prepare(query).bind(...params).all();

  // Map results to include employer object
  const mappedContacts = contacts.results.map((row: any) => ({
    ...row,
    employer: row._employerId ? {
      id: row._employerId,
      name: row._employerName
    } : null,
    // Clean up temporary columns
    _employerId: undefined,
    _employerName: undefined
  }));

  return c.json({ contacts: mappedContacts });
});

app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(`
    SELECT c.*, e.id as _employerId, e.name as _employerName
    FROM Contact c
    LEFT JOIN Employer e ON c.employerId = e.id
    WHERE c.id = ? AND c.userId = ?
  `).bind(id, userId).first();

  if (!row) {
    return c.json({ error: 'Contact not found' }, 404);
  }

  const contact = {
    ...row,
    employer: row._employerId ? {
      id: row._employerId,
      name: row._employerName
    } : null,
    _employerId: undefined,
    _employerName: undefined
  };

  return c.json({ contact });
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO Contact (id, userId, employerId, name, title, email, linkedInUrl, phone,
                         isFunctionallyRelevant, isAlumni, levelAboveTarget,
                         isInternallyPromoted, hasUniqueName, contactMethod,
                         segment, priority, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.employerId, body.name, body.title || null, body.email || null,
    body.linkedInUrl || null, body.phone || null,
    body.isFunctionallyRelevant ? 1 : 0,
    body.isAlumni ? 1 : 0,
    body.levelAboveTarget || 0,
    body.isInternallyPromoted ? 1 : 0,
    body.hasUniqueName ? 1 : 0,
    body.contactMethod || null,
    body.segment || 'UNKNOWN',
    body.priority || 1,
    body.notes || null
  ).run();

  const contact = await c.env.DB.prepare('SELECT * FROM Contact WHERE id = ?').bind(id).first();
  return c.json({ contact }, 201);
});

app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM Contact WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Contact not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  const updatable = ['name', 'title', 'email', 'linkedInUrl', 'phone', 'notes',
    'isFunctionallyRelevant', 'isAlumni', 'levelAboveTarget', 'isInternallyPromoted',
    'hasUniqueName', 'contactMethod', 'segment', 'priority'];

  for (const field of updatable) {
    if (field in body) {
      const col = field === 'isFunctionallyRelevant' || field === 'isAlumni' ||
                  field === 'isInternallyPromoted' || field === 'hasUniqueName'
                  ? field.replace('is', 'is') : field;
      updates.push(`${col} = ?`);
      values.push(typeof body[field] === 'boolean' ? (body[field] ? 1 : 0) : (body[field] || null));
    }
  }

  updates.push('updatedAt = datetime(\'now\')');
  values.push(id, userId);

  await c.env.DB.prepare(`UPDATE Contact SET ${updates.join(', ')} WHERE id = ? AND userId = ?`)
    .bind(...values).run();

  const contact = await c.env.DB.prepare('SELECT * FROM Contact WHERE id = ?').bind(id).first();
  return c.json({ contact });
});

app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM Contact WHERE id = ? AND userId = ?'
  ).bind(id, userId).run();

  if (!result.success || result.meta.changes === 0) {
    return c.json({ error: 'Contact not found' }, 404);
  }

  return c.json({ success: true });
});

export default app;
