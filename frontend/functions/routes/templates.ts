/**
 * Email Template Routes
 */

import { Hono } from 'hono';

type TemplateType = 'SIX_POINT_INITIAL' | 'SIX_POINT_NO_CONNECTION' | 'SIX_POINT_WITH_POSTING' | 'FOLLOW_UP_7B' | 'THANK_YOU' | 'REFERRAL_REQUEST';

const app = new Hono();

// Get all templates (user's templates + default templates)
app.get('/', async (c) => {
  const userId = c.get('userId');

  const templates = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE userId IS NULL OR userId = ? ORDER BY isDefault DESC, name ASC'
  ).bind(userId).all();

  return c.json({ templates: templates.results });
});

// Get templates by type
app.get('/type/:type', async (c) => {
  const userId = c.get('userId');
  const type = c.req.param('type');

  const templates = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE (userId IS NULL OR userId = ?) AND type = ? ORDER BY isDefault DESC, name ASC'
  ).bind(userId, type).all();

  return c.json(templates.results);
});

// Get single template by ID
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const template = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE id = ? AND (userId IS NULL OR userId = ?)'
  ).bind(id, userId).first();

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  return c.json(template);
});

// Create template
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = crypto.randomUUID();

  // Calculate word count
  const wordCount = body.body?.split(/\s+/).filter((w: string) => w.length > 0).length || 0;

  // Extract variables from body ({{variable}} format)
  const variableMatches = body.body?.match(/\{\{(\w+)\}\}/g) || [];
  const extractedVars = variableMatches.map((v: string) => v.replace(/\{\{|\}\}/g, ''));
  const variables = [...new Set([...(body.variables || []), ...extractedVars])];

  // If marking as default, unset other defaults of same type for this user
  if (body.isDefault) {
    await c.env.DB.prepare(
      'UPDATE EmailTemplate SET isDefault = 0 WHERE userId = ? AND type = ? AND isDefault = 1'
    ).bind(userId, body.type).run();
  }

  await c.env.DB.prepare(`
    INSERT INTO EmailTemplate (id, userId, name, type, subject, body, variables, wordCount, isDefault, encryptedData, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, userId, body.name, body.type, body.subject, body.body,
    JSON.stringify(variables), wordCount,
    body.isDefault ? 1 : 0,
    body.encryptedData || null
  ).run();

  const template = await c.env.DB.prepare('SELECT * FROM EmailTemplate WHERE id = ?').bind(id).first();
  return c.json({ template }, 201);
});

// Update template
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  // Verify template belongs to user
  const existing = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Template not found' }, 404);
  }

  // Calculate word count if body changed
  let wordCount = body.body?.split(/\s+/).filter((w: string) => w.length > 0).length;
  if (wordCount === undefined) {
    wordCount = existing.wordCount;
  }

  // Extract variables from body if provided
  let variables = existing.variables;
  if (body.body) {
    const variableMatches = body.body.match(/\{\{(\w+)\}\}/g) || [];
    const extractedVars = variableMatches.map((v: string) => v.replace(/\{\{|\}\}/g, ''));
    variables = [...new Set([...(body.variables || []), ...extractedVars])];
  }

  // If marking as default, unset other defaults of same type for this user
  if (body.isDefault && body.type) {
    await c.env.DB.prepare(
      'UPDATE EmailTemplate SET isDefault = 0 WHERE userId = ? AND type = ? AND isDefault = 1 AND id != ?'
    ).bind(userId, body.type, id).run();
  }

  // Build dynamic UPDATE query
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }
  if (body.subject !== undefined) { updates.push('subject = ?'); values.push(body.subject); }
  if (body.body !== undefined) { updates.push('body = ?'); values.push(body.body); }
  if (variables !== undefined) { updates.push('variables = ?'); values.push(JSON.stringify(variables)); }
  if (wordCount !== undefined) { updates.push('wordCount = ?'); values.push(wordCount); }
  if (body.isDefault !== undefined) { updates.push('isDefault = ?'); values.push(body.isDefault ? 1 : 0); }
  if (body.encryptedData !== undefined) { updates.push('encryptedData = ?'); values.push(body.encryptedData); }

  updates.push('updatedAt = datetime("now")');
  values.push(id, userId);

  await c.env.DB.prepare(
    `UPDATE EmailTemplate SET ${updates.join(', ')} WHERE id = ? AND userId = ?`
  ).bind(...values).run();

  const template = await c.env.DB.prepare('SELECT * FROM EmailTemplate WHERE id = ?').bind(id).first();
  return c.json(template);
});

// Delete template
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  // Verify template belongs to user
  const existing = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE id = ? AND userId = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: 'Template not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM EmailTemplate WHERE id = ?').bind(id).run();

  return c.body(null, 204);
});

// Generate email from template
app.post('/:id/generate', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const vars = await c.req.json();

  // Verify template exists and user has access
  const template = await c.env.DB.prepare(
    'SELECT * FROM EmailTemplate WHERE id = ? AND (userId IS NULL OR userId = ?)'
  ).bind(id, userId).first();

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  // Replace variables in subject and body
  let subject = template.subject;
  let body = template.body;

  const replacements: Record<string, string> = {
    contactName: vars.contactName || '',
    employerName: vars.employerName || '',
    connection: vars.connection || '',
    jobTitle: vars.jobTitle || '',
    broadInterest: vars.broadInterest || '',
    postingTitle: vars.postingTitle || '',
  };

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  }

  // Calculate final word count
  const wordCount = body.split(/\s+/).filter((w: string) => w.length > 0).length;

  // Validate 6-point email rules
  const warnings: string[] = [];
  if (template.type.startsWith('SIX_POINT') && wordCount > 75) {
    warnings.push(`Word count (${wordCount}) exceeds 75-word limit for 6-Point Email`);
  }

  return c.json({
    subject,
    body,
    wordCount,
    warnings,
    meetsGuidelines: warnings.length === 0
  });
});

// Seed default templates
app.post('/seed', async (c) => {
  const userId = c.get('userId');

  const defaultTemplates = [
    {
      name: '6-Point Email - With Connection',
      type: 'SIX_POINT_INITIAL' as TemplateType,
      subject: 'Your {{jobTitle}} experience at {{employerName}}',
      body: `Hi {{contactName}},

I'm {{yourName}}, {{connection}}. May I chat with you for a few minutes about your {{jobTitle}} experience at {{employerName}}?

I am trying to learn more about {{broadInterest}}, so your insights would be greatly appreciated.

Best regards,
{{yourName}}`,
      variables: ['contactName', 'connection', 'jobTitle', 'employerName', 'broadInterest', 'yourName'],
      isDefault: true,
    },
    {
      name: '6-Point Email - No Connection',
      type: 'SIX_POINT_NO_CONNECTION' as TemplateType,
      subject: 'Your {{jobTitle}} experience at {{employerName}}',
      body: `Hi {{contactName}},

May I chat with you for a few minutes about your {{jobTitle}} experience at {{employerName}}?

I am trying to learn more about {{broadInterest}}, so your insights would be greatly appreciated.

Best regards,
{{yourName}}`,
      variables: ['contactName', 'jobTitle', 'employerName', 'broadInterest', 'yourName'],
      isDefault: true,
    },
    {
      name: '6-Point Email - With Job Posting',
      type: 'SIX_POINT_WITH_POSTING' as TemplateType,
      subject: 'Your {{jobTitle}} experience at {{employerName}}',
      body: `Hi {{contactName}},

I'm {{yourName}}, {{connection}}. May I have a few minutes to ask you about your {{jobTitle}} experience at {{employerName}}?

Your insights would be greatly appreciated, since I'm now in the process of deciding whether to apply for your open {{postingTitle}} position.

Best regards,
{{yourName}}`,
      variables: ['contactName', 'connection', 'jobTitle', 'employerName', 'postingTitle', 'yourName'],
      isDefault: true,
    },
    {
      name: '7B Follow-up',
      type: 'FOLLOW_UP_7B' as TemplateType,
      subject: 'RE: Your {{jobTitle}} experience at {{employerName}}',
      body: `Hi {{contactName}},

I just wanted to follow up on my message from last week. Might this week be a more convenient time for you to chat about your {{employerName}} experience? Please let me know if so!

Best regards,
{{yourName}}`,
      variables: ['contactName', 'jobTitle', 'employerName', 'yourName'],
      isDefault: true,
    },
    {
      name: 'Thank You',
      type: 'THANK_YOU' as TemplateType,
      subject: 'Thank you for your time',
      body: `Hi {{contactName}},

Thank you so much for taking the time to speak with me today about {{employerName}}. Your insights about {{broadInterest}} were incredibly helpful.

I'll be sure to follow up on [specific next step they suggested].

Best regards,
{{yourName}}`,
      variables: ['contactName', 'employerName', 'broadInterest', 'yourName'],
      isDefault: true,
    },
  ];

  let seeded = 0;
  for (const template of defaultTemplates) {
    const wordCount = template.body.split(/\s+/).filter((w: string) => w.length > 0).length;
    const templateId = `default-${template.type}-${userId}`;

    // Upsert template
    const existing = await c.env.DB.prepare('SELECT id FROM EmailTemplate WHERE id = ?').bind(templateId).first();

    if (!existing) {
      await c.env.DB.prepare(`
        INSERT INTO EmailTemplate (id, userId, name, type, subject, body, variables, wordCount, isDefault, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        templateId, userId, template.name, template.type, template.subject, template.body,
        JSON.stringify(template.variables), wordCount, 1
      ).run();
      seeded++;
    } else {
      await c.env.DB.prepare(`
        UPDATE EmailTemplate SET name = ?, subject = ?, body = ?, variables = ?, wordCount = ?, isDefault = 1, updatedAt = datetime('now')
        WHERE id = ?
      `).bind(
        template.name, template.subject, template.body,
        JSON.stringify(template.variables), wordCount, templateId
      ).run();
      seeded++;
    }
  }

  return c.json({ success: true, seeded });
});

export default app;
