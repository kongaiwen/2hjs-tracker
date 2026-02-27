/**
 * Bulk Export/Import Routes
 */

import { Hono } from 'hono';

const app = new Hono();

// GET /api/bulk/export - Export all user data as JSON
app.get('/export', async (c) => {
  const userId = c.get('userId');

  // Export all user data for backup/import
  const employers = await c.env.DB.prepare(`
    SELECT * FROM Employer WHERE userId = ?
  `).bind(userId).all();

  const contacts = await c.env.DB.prepare(`
    SELECT c.*, e.name as employerName
    FROM Contact c
    LEFT JOIN Employer e ON c.employerId = e.id
    WHERE c.userId = ?
  `).bind(userId).all();

  const outreach = await c.env.DB.prepare(`
    SELECT o.*, c.name as contactName, e.name as employerName
    FROM Outreach o
    LEFT JOIN Contact c ON o.contactId = c.id
    LEFT JOIN Employer e ON o.employerId = e.id
    WHERE o.userId = ?
  `).bind(userId).all();

  const templates = await c.env.DB.prepare(`
    SELECT * FROM EmailTemplate WHERE userId = ? OR userId IS NULL
  `).bind(userId).all();

  const informationals = await c.env.DB.prepare(`
    SELECT i.*, c.name as contactName
    FROM Informational i
    LEFT JOIN Contact c ON i.contactId = c.id
    WHERE i.userId = ?
  `).bind(userId).all();

  return c.json({
    employers: employers.results,
    contacts: contacts.results,
    outreach: outreach.results,
    templates: templates.results,
    informationals: informationals.results,
  });
});

export default app;
