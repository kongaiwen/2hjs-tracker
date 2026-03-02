/**
 * Bulk Export/Import Routes
 */

import { Hono } from 'hono';

const app = new Hono();

interface BulkImportData {
  employers?: Array<any>;
  contacts?: Array<any>;
  outreach?: Array<any>;
  informationals?: Array<any>;
  emailTemplates?: Array<any>;
  settings?: any;
}

// GET /api/bulk/export - Export all user data as JSON
app.get('/export', async (c) => {
  const userId = c.get('userId');

  // Export all user data for backup/import
  const [employers, contacts, outreach, templates, informationals, settings] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM Employer WHERE userId = ?`).bind(userId).all(),
    c.env.DB.prepare(`
      SELECT c.*, e.name as employerName
      FROM Contact c
      LEFT JOIN Employer e ON c.employerId = e.id
      WHERE c.userId = ?
    `).bind(userId).all(),
    c.env.DB.prepare(`
      SELECT o.*, c.name as contactName, e.name as employerName
      FROM Outreach o
      LEFT JOIN Contact c ON o.contactId = c.id
      LEFT JOIN Employer e ON o.employerId = e.id
      WHERE o.userId = ?
    `).bind(userId).all(),
    c.env.DB.prepare(`SELECT * FROM EmailTemplate WHERE userId = ?`).bind(userId).all(),
    c.env.DB.prepare(`
      SELECT i.*, c.name as contactName, e.name as employerName
      FROM Informational i
      LEFT JOIN Contact c ON i.contactId = c.id
      LEFT JOIN Employer e ON c.employerId = e.id
      WHERE i.userId = ?
    `).bind(userId).all(),
    c.env.DB.prepare(`SELECT * FROM Settings WHERE userId = ?`).bind(userId).first(),
  ]);

  return c.json({
    employers: employers.results,
    contacts: contacts.results,
    outreach: outreach.results,
    emailTemplates: templates.results,
    informationals: informationals.results,
    settings,
  });
});

// POST /api/bulk/import - Import all user data in one transaction
app.post('/import', async (c) => {
  const userId = c.get('userId');
  const data = await c.req.json<BulkImportData>();

  const results = {
    created: { employers: 0, contacts: 0, outreach: 0, informationals: 0, emailTemplates: 0 },
    updated: { employers: 0, contacts: 0, outreach: 0, informationals: 0, emailTemplates: 0 },
    errors: [] as string[],
  };

  // Build employer name -> ID map for lookups
  const employerNameToId = new Map<string, string>();
  const employerIdToName = new Map<string, string>();

  // First, load all existing employers into the map for matching
  const existingEmployers = await c.env.DB.prepare(
    `SELECT id, name FROM Employer WHERE userId = ?`
  ).bind(userId).all();
  for (const e of existingEmployers.results as any[]) {
    employerNameToId.set(e.name, e.id);
    employerIdToName.set(e.id, e.name);
  }

  // Step 1: Import employers
  if (data.employers && Array.isArray(data.employers)) {
    for (let i = 0; i < data.employers.length; i++) {
      const emp = data.employers[i];
      try {
        const empName = emp?.name || `UNKNOWN_${i}`;
        console.log(`[Import] Processing employer ${i+1}/${data.employers.length}: "${empName}"`);

        // Check if employer exists by name
        const existing = await c.env.DB.prepare(
          `SELECT id FROM Employer WHERE userId = ? AND name = ?`
        ).bind(userId, empName).first();

        const employerData = {
          userId,
          name: empName,
          website: emp?.website || null,
          industry: emp?.industry || null,
          location: emp?.location || null,
          notes: emp?.notes || null,
          advocacy: (emp?.advocacy === true || emp?.advocacy === 1) ? 1 : 0,
          motivation: emp?.motivation ?? 0,
          posting: emp?.posting ?? 1,
          status: emp?.status || 'ACTIVE',
          isNetworkOrg: (emp?.isNetworkOrg === true || emp?.isNetworkOrg === 1) ? 1 : 0,
          lampRank: emp?.lampRank || null,
        };

        if (existing) {
          console.log(`[Import] Employer "${empName}" exists, updating...`);
          await c.env.DB.prepare(`
            UPDATE Employer SET
              website = ?, industry = ?, location = ?, notes = ?,
              advocacy = ?, motivation = ?, posting = ?, status = ?, isNetworkOrg = ?, lampRank = ?
            WHERE id = ?
          `).bind(
            employerData.website, employerData.industry, employerData.location, employerData.notes,
            employerData.advocacy, employerData.motivation, employerData.posting,
            employerData.status, employerData.isNetworkOrg, employerData.lampRank,
            existing.id
          ).run();
          results.updated.employers++;
          employerNameToId.set(empName, existing.id as string);
          employerIdToName.set(existing.id as string, empName);
        } else {
          console.log(`[Import] Employer "${empName}" is new, creating...`);

          // Generate ID before INSERT (D1 doesn't return generated IDs for TEXT primary keys)
          const newId = crypto.randomUUID();

          await c.env.DB.prepare(`
            INSERT INTO Employer (id, userId, name, website, industry, location, notes, advocacy, motivation, posting, status, isNetworkOrg, lampRank, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            newId,
            employerData.userId, employerData.name, employerData.website, employerData.industry,
            employerData.location, employerData.notes, employerData.advocacy, employerData.motivation,
            employerData.posting, employerData.status, employerData.isNetworkOrg, employerData.lampRank
          ).run();

          console.log(`[Import] Created employer "${empName}" with ID: ${newId}`);
          employerNameToId.set(empName, newId);
          employerIdToName.set(newId, empName);
          results.created.employers++;
        }
      } catch (e) {
        console.log(`[Import] ERROR processing employer: ${e}`);
        results.errors.push(`Employer "${emp?.name || 'unknown'}": ${e}`);
      }
    }
    console.log(`[Import] Finished employers. Map has ${employerNameToId.size} entries`);
  }

  // Build contact name+employer -> ID map
  const contactKeyToId = new Map<string, string>();
  const contactIdToInfo = new Map<string, { name: string; employerId: string }>();

  // Get existing contacts for matching
  const existingContacts = await c.env.DB.prepare(
    `SELECT id, name, employerId FROM Contact WHERE userId = ?`
  ).bind(userId).all();
  for (const c of existingContacts.results as any[]) {
    contactKeyToId.set(`${c.name}|${c.employerId}`, c.id);
  }

  // Step 2: Import contacts
  if (data.contacts && Array.isArray(data.contacts)) {
    for (const cont of data.contacts) {
      try {
        // Get employer ID - try multiple sources
        let employerId: string | undefined;
        if (cont._employerName) {
          // From PostgreSQL export with joined name
          employerId = employerNameToId.get(cont._employerName);
        } else if (cont.employerName) {
          // From D1 export with joined name
          employerId = employerNameToId.get(cont.employerName);
        } else if (cont.employerId) {
          // Direct ID reference (may not work across systems)
          employerId = employerNameToId.get(cont.employerId);
        } else if (cont.employer) {
          // Match by employer name
          employerId = employerNameToId.get(cont.employer);
        }

        if (!employerId) {
          results.errors.push(`Contact "${cont.name}": Could not find employer`);
          continue;
        }

        const contactKey = `${cont.name}|${employerId}`;
        const existingId = contactKeyToId.get(contactKey);

        const contactData = {
          userId,
          employerId,
          name: cont.name,
          title: cont.title || null,
          email: cont.email || null,
          linkedInUrl: cont.linkedInUrl || null,
          phone: cont.phone || null,
          notes: cont.notes || null,
          isFunctionallyRelevant: cont.isFunctionallyRelevant === true ? 1 : 0,
          isAlumni: cont.isAlumni === true ? 1 : 0,
          levelAboveTarget: cont.levelAboveTarget ?? 0,
          isInternallyPromoted: cont.isInternallyPromoted === true ? 1 : 0,
          hasUniqueName: cont.hasUniqueName === true ? 1 : 0,
          contactMethod: cont.contactMethod || null,
          segment: cont.segment || 'UNKNOWN',
          priority: cont.priority ?? 1,
        };

        if (existingId) {
          await c.env.DB.prepare(`
            UPDATE Contact SET
              title = ?, email = ?, linkedInUrl = ?, phone = ?, notes = ?,
              isFunctionallyRelevant = ?, isAlumni = ?, levelAboveTarget = ?,
              isInternallyPromoted = ?, hasUniqueName = ?, contactMethod = ?,
              segment = ?, priority = ?
            WHERE id = ?
          `).bind(
            contactData.title, contactData.email, contactData.linkedInUrl, contactData.phone, contactData.notes,
            contactData.isFunctionallyRelevant, contactData.isAlumni, contactData.levelAboveTarget,
            contactData.isInternallyPromoted, contactData.hasUniqueName, contactData.contactMethod,
            contactData.segment, contactData.priority, existingId
          ).run();
          results.updated.contacts++;
          contactIdToInfo.set(existingId, { name: cont.name, employerId });
        } else {
          // Generate ID before INSERT
          const newId = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO Contact (id, userId, employerId, name, title, email, linkedInUrl, phone, notes,
              isFunctionallyRelevant, isAlumni, levelAboveTarget, isInternallyPromoted, hasUniqueName,
              contactMethod, segment, priority, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            newId,
            contactData.userId, contactData.employerId, contactData.name, contactData.title,
            contactData.email, contactData.linkedInUrl, contactData.phone, contactData.notes,
            contactData.isFunctionallyRelevant, contactData.isAlumni, contactData.levelAboveTarget,
            contactData.isInternallyPromoted, contactData.hasUniqueName, contactData.contactMethod,
            contactData.segment, contactData.priority
          ).run();
          contactKeyToId.set(contactKey, newId);
          contactIdToInfo.set(newId, { name: cont.name, employerId });
          results.created.contacts++;
        }
      } catch (e) {
        results.errors.push(`Contact "${cont.name}": ${e}`);
      }
    }
  }

  // Helper to find contact ID by name and employer
  function findContactId(name: string, employerId?: string): string | undefined {
    // First try exact match with employer
    if (employerId) {
      for (const [key, id] of contactKeyToId.entries()) {
        if (key === `${name}|${employerId}`) return id;
      }
      // Check newly created contacts
      for (const [id, info] of contactIdToInfo.entries()) {
        if (info.name === name && info.employerId === employerId) return id;
      }
      // Case-insensitive fallback with employer
      for (const [key, id] of contactKeyToId.entries()) {
        const [contactName, empId] = key.split('|');
        if (contactName.toLowerCase() === name.toLowerCase() && empId === employerId) return id;
      }
      for (const [id, info] of contactIdToInfo.entries()) {
        if (info.name.toLowerCase() === name.toLowerCase() && info.employerId === employerId) return id;
      }
    }
    // Fallback: find any contact with this name (check both existing and new contacts)
    for (const [key, id] of contactKeyToId.entries()) {
      const [contactName] = key.split('|');
      if (contactName.toLowerCase() === name.toLowerCase()) return id;
    }
    for (const [id, info] of contactIdToInfo.entries()) {
      if (info.name.toLowerCase() === name.toLowerCase()) return id;
    }
    return undefined;
  }

  // Step 3: Import outreach
  if (data.outreach && Array.isArray(data.outreach)) {
    for (let i = 0; i < data.outreach.length; i++) {
      const out = data.outreach[i];
      try {
        console.log(`[Import] Processing outreach ${i+1}/${data.outreach.length}: "${out.subject?.substring(0, 30)}"`);
        console.log(`[Import]   Raw data - _employerName: "${out._employerName}", employerName: "${out.employerName}", employer: "${out.employer}"`);
        console.log(`[Import]   Raw data - _contactName: "${out._contactName}", contactName: "${out.contactName}", contact: "${out.contact}"`);

        // Find employer - try multiple sources with case-insensitive fallback
        let employerId: string | undefined;
        let employerLookupName = out._employerName || out.employerName || out.employer || '';

        // Direct lookup first
        employerId = employerNameToId.get(employerLookupName);

        // Case-insensitive fallback
        if (!employerId && employerLookupName) {
          for (const [name, id] of employerNameToId.entries()) {
            if (name.toLowerCase() === employerLookupName.toLowerCase()) {
              employerId = id;
              console.log(`[Import]   Found employer via case-insensitive match: "${name}" -> ${id}`);
              break;
            }
          }
        }

        if (!employerId) {
          results.errors.push(`Outreach: Could not find employer "${employerLookupName}" for "${out.subject}"`);
          continue;
        }

        console.log(`[Import]   Employer ID: ${employerId}`);

        // Find contact - try multiple sources
        let contactId: string | undefined;
        let contactLookupName = out._contactName || out.contactName || out.contact || '';

        // Try with employer ID first (most precise)
        if (contactLookupName) {
          contactId = findContactId(contactLookupName, employerId);
          console.log(`[Import]   Contact lookup "${contactLookupName}" with employer ${employerId}: ${contactId || 'not found'}`);
        }

        // Fallback: lookup without employer (less precise but better than nothing)
        if (!contactId && contactLookupName) {
          contactId = findContactId(contactLookupName);
          console.log(`[Import]   Contact lookup "${contactLookupName}" without employer: ${contactId || 'not found'}`);
        }

        if (!contactId) {
          results.errors.push(`Outreach: Could not find contact "${contactLookupName}" at employer "${employerLookupName}" for "${out.subject}"`);
          continue;
        }

        console.log(`[Import]   Contact ID: ${contactId}`);

        // Check if outreach exists (by contactId + sentAt)
        const existing = await c.env.DB.prepare(
          `SELECT id FROM Outreach WHERE userId = ? AND contactId = ? AND datetime(sentAt) = datetime(?)`
        ).bind(userId, contactId, out.sentAt).first();

        const outreachData = {
          userId,
          employerId,
          contactId,
          subject: out.subject,
          body: out.body,
          wordCount: out.wordCount ?? (out.body ? out.body.split(/\s+/).length : 0),
          sentAt: out.sentAt,
          threeB_Date: out.threeB_Date || null,
          sevenB_Date: out.sevenB_Date || null,
          responseAt: out.responseAt || null,
          responseType: out.responseType || null,
          followUpSentAt: out.followUpSentAt || null,
          followUpBody: out.followUpBody || null,
          status: out.status || 'SENT',
          gmailDraftId: out.gmailDraftId || null,
          gmailMessageId: out.gmailMessageId || null,
          calendarEventId: out.calendarEventId || null,
          notes: out.notes || null,
        };

        if (existing) {
          console.log(`[Import]   Updating existing outreach: employerId=${outreachData.employerId}, contactId=${outreachData.contactId}`);
          await c.env.DB.prepare(`
            UPDATE Outreach SET
              employerId = ?, contactId = ?, subject = ?, body = ?, wordCount = ?, sentAt = ?,
              threeB_Date = ?, sevenB_Date = ?, responseAt = ?, responseType = ?,
              followUpSentAt = ?, followUpBody = ?, status = ?,
              gmailDraftId = ?, gmailMessageId = ?, calendarEventId = ?, notes = ?
            WHERE id = ?
          `).bind(
            outreachData.employerId, outreachData.contactId, outreachData.subject, outreachData.body, outreachData.wordCount, outreachData.sentAt,
            outreachData.threeB_Date, outreachData.sevenB_Date, outreachData.responseAt, outreachData.responseType,
            outreachData.followUpSentAt, outreachData.followUpBody, outreachData.status,
            outreachData.gmailDraftId, outreachData.gmailMessageId, outreachData.calendarEventId,
            outreachData.notes, existing.id
          ).run();
          results.updated.outreach++;
        } else {
          const newId = crypto.randomUUID();
          console.log(`[Import]   Creating new outreach: employerId=${outreachData.employerId}, contactId=${outreachData.contactId}`);
          await c.env.DB.prepare(`
            INSERT INTO Outreach (id, userId, employerId, contactId, subject, body, wordCount, sentAt,
              threeB_Date, sevenB_Date, responseAt, responseType, followUpSentAt, followUpBody,
              status, gmailDraftId, gmailMessageId, calendarEventId, notes, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            newId,
            outreachData.userId, outreachData.employerId, outreachData.contactId, outreachData.subject,
            outreachData.body, outreachData.wordCount, outreachData.sentAt, outreachData.threeB_Date,
            outreachData.sevenB_Date, outreachData.responseAt, outreachData.responseType,
            outreachData.followUpSentAt, outreachData.followUpBody, outreachData.status,
            outreachData.gmailDraftId, outreachData.gmailMessageId, outreachData.calendarEventId,
            outreachData.notes
          ).run();
          results.created.outreach++;
        }
      } catch (e) {
        results.errors.push(`Outreach "${out.subject}": ${e}`);
      }
    }
  }

  // Step 4: Import informationals
  if (data.informationals && Array.isArray(data.informationals)) {
    for (const info of data.informationals) {
      try {
        // Find contact - try multiple sources
        let contactId: string | undefined;
        if (info._contactName) {
          contactId = findContactId(info._contactName);
        } else if (info.contactName) {
          contactId = findContactId(info.contactName);
        } else if (info.contactId) {
          contactId = info.contactId;
        } else if (info.contact) {
          contactId = findContactId(info.contact);
        }

        if (!contactId) {
          results.errors.push(`Informational: Could not find contact (scheduled: ${info.scheduledAt})`);
          continue;
        }

        // Check if informational exists
        const existing = await c.env.DB.prepare(
          `SELECT id FROM Informational WHERE userId = ? AND contactId = ? AND datetime(scheduledAt) = datetime(?)`
        ).bind(userId, contactId, info.scheduledAt).first();

        const informationalData = {
          userId,
          contactId,
          scheduledAt: info.scheduledAt,
          duration: info.duration ?? 30,
          method: info.method || 'PHONE',
          researchNotes: info.researchNotes || null,
          bigFourAnswers: info.bigFourAnswers ? JSON.stringify(info.bigFourAnswers) : null,
          tiaraQuestions: info.tiaraQuestions ? JSON.stringify(info.tiaraQuestions) : null,
          completedAt: info.completedAt || null,
          outcome: info.outcome || null,
          referralName: info.referralName || null,
          referralContact: info.referralContact || null,
          nextSteps: info.nextSteps || null,
          calendarEventId: info.calendarEventId || null,
          notes: info.notes || null,
        };

        if (existing) {
          await c.env.DB.prepare(`
            UPDATE Informational SET
              contactId = ?, duration = ?, method = ?, researchNotes = ?,
              bigFourAnswers = ?, tiaraQuestions = ?, completedAt = ?,
              outcome = ?, referralName = ?, referralContact = ?,
              nextSteps = ?, calendarEventId = ?, notes = ?
            WHERE id = ?
          `).bind(
            informationalData.contactId, informationalData.duration, informationalData.method, informationalData.researchNotes,
            informationalData.bigFourAnswers, informationalData.tiaraQuestions, informationalData.completedAt,
            informationalData.outcome, informationalData.referralName, informationalData.referralContact,
            informationalData.nextSteps, informationalData.calendarEventId, informationalData.notes,
            existing.id
          ).run();
          results.updated.informationals++;
        } else {
          const newId = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO Informational (id, userId, contactId, scheduledAt, duration, method, researchNotes,
              bigFourAnswers, tiaraQuestions, completedAt, outcome, referralName, referralContact,
              nextSteps, calendarEventId, notes, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            newId,
            informationalData.userId, informationalData.contactId, informationalData.scheduledAt,
            informationalData.duration, informationalData.method, informationalData.researchNotes,
            informationalData.bigFourAnswers, informationalData.tiaraQuestions, informationalData.completedAt,
            informationalData.outcome, informationalData.referralName, informationalData.referralContact,
            informationalData.nextSteps, informationalData.calendarEventId, informationalData.notes
          ).run();
          results.created.informationals++;
        }
      } catch (e) {
        results.errors.push(`Informational (${info.scheduledAt}): ${e}`);
      }
    }
  }

  // Step 5: Import email templates
  if (data.emailTemplates && Array.isArray(data.emailTemplates)) {
    for (const tmpl of data.emailTemplates) {
      try {
        // Check if template exists by name
        const existing = await c.env.DB.prepare(
          `SELECT id FROM EmailTemplate WHERE userId = ? AND name = ?`
        ).bind(userId, tmpl.name).first();

        const wordCount = tmpl.wordCount ?? (tmpl.body ? tmpl.body.split(/\s+/).length : 0);

        if (existing) {
          await c.env.DB.prepare(`
            UPDATE EmailTemplate SET
              type = ?, subject = ?, body = ?, wordCount = ?, variables = ?
            WHERE id = ?
          `).bind(
            tmpl.type, tmpl.subject, tmpl.body, wordCount,
            tmpl.variables ? JSON.stringify(tmpl.variables) : null,
            existing.id
          ).run();
          results.updated.emailTemplates++;
        } else {
          const newId = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO EmailTemplate (id, userId, name, type, subject, body, wordCount, variables, isDefault, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            newId,
            userId, tmpl.name, tmpl.type, tmpl.subject, tmpl.body, wordCount,
            tmpl.variables ? JSON.stringify(tmpl.variables) : null,
            tmpl.isDefault === true ? 1 : 0
          ).run();
          results.created.emailTemplates++;
        }
      } catch (e) {
        results.errors.push(`Template "${tmpl.name}": ${e}`);
      }
    }
  }

  return c.json(results);
});

export default app;
