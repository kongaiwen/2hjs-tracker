/**
 * D1 Import Script
 *
 * Imports migrated data into Cloudflare D1 database.
 * Run this after: npm run migrate:data
 *
 * Usage:
 *   node backend/workers/scripts/import.js <path-to-migration-json>
 */

interface D1MigrationData {
  version: string;
  exportedAt: string;
  users: any[];
  employers: any[];
  contacts: any[];
  outreach: any[];
  informationals: any[];
  emailTemplates: any[];
  chatMessages: any[];
  settings: any[];
}

async function importToD1(migrationFile: string) {
  const fs = await import('fs');
  const { execSync } = await import('child_process');

  console.log(`📂 Reading migration file: ${migrationFile}`);
  const data: D1MigrationData = JSON.parse(fs.readFileSync(migrationFile, 'utf-8'));

  const DB_NAME = '2hjs-tracker-db';
  const BATCH_SIZE = 50;

  async function executeQuery(query: string, params: (string | number)[] = []) {
    try {
      const escapedParams = params.map((p) =>
        typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p
      ).join(', ');

      let fullQuery = query;
      if (params.length > 0 && query.includes('?')) {
        let paramIndex = 0;
        fullQuery = query.replace(/\?/g, () => escapedParams[paramIndex++] || '?');
      }

      const result = execSync(
        `wrangler d1 execute ${DB_NAME} --command="${fullQuery.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8' }
      );
      return JSON.parse(result);
    } catch (error) {
      console.error('Query failed:', query);
      throw error;
    }
  }

  async function batchInsert(
    tableName: string,
    records: any[],
    columns: string[]
  ) {
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const values = batch.map((r) =>
        columns.map((col) => {
          const val = r[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'boolean') return val ? '1' : '0';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          return `'${val}'`;
        }).join(', ')
      ).join('),(');

      const query = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${values});`;

      try {
        await executeQuery(query);
        console.log(`  ✓ Imported ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} records to ${tableName}`);
      } catch (error) {
        console.error(`  ✗ Failed to import batch ${i / BATCH_SIZE} to ${tableName}`);
        throw error;
      }
    }
  }

  console.log('\n🚀 Starting import to D1...\n');

  // Import Users
  if (data.users.length > 0) {
    console.log(`📥 Importing ${data.users.length} users...`);
    await batchInsert('User', data.users, [
      'id', 'email', 'tenantId', 'role', 'publicKey', 'keyFingerprint', 'keyCreatedAt',
      'encryptedData', 'dataVersion', 'storageUsed', 'requestCount', 'lastRequestAt',
      'firstSeenAt', 'lastLoginAt', 'createdAt', 'updatedAt',
    ]);
  }

  // Import Employers
  if (data.employers.length > 0) {
    console.log(`📥 Importing ${data.employers.length} employers...`);
    await batchInsert('Employer', data.employers, [
      'id', 'name', 'website', 'industry', 'location', 'notes',
      'advocacy', 'motivation', 'posting', 'lampRank', 'status', 'isNetworkOrg',
      'userId', 'createdAt', 'updatedAt',
    ]);
  }

  // Import Contacts
  if (data.contacts.length > 0) {
    console.log(`📥 Importing ${data.contacts.length} contacts...`);
    await batchInsert('Contact', data.contacts, [
      'id', 'employerId', 'name', 'title', 'email', 'linkedInUrl', 'phone',
      'isFunctionallyRelevant', 'isAlumni', 'levelAboveTarget',
      'isInternallyPromoted', 'hasUniqueName', 'contactMethod',
      'segment', 'priority', 'userId', 'notes', 'createdAt', 'updatedAt',
    ]);
  }

  // Import Outreach
  if (data.outreach.length > 0) {
    console.log(`📥 Importing ${data.outreach.length} outreach records...`);
    await batchInsert('Outreach', data.outreach, [
      'id', 'employerId', 'contactId', 'subject', 'body', 'wordCount',
      'sentAt', 'threeB_Date', 'sevenB_Date', 'responseAt', 'responseType',
      'followUpSentAt', 'followUpBody', 'status', 'gmailDraftId',
      'gmailMessageId', 'calendarEventId', 'userId', 'notes', 'createdAt', 'updatedAt',
    ]);
  }

  // Import Informationals
  if (data.informationals.length > 0) {
    console.log(`📥 Importing ${data.informationals.length} informationals...`);
    await batchInsert('Informational', data.informationals, [
      'id', 'contactId', 'scheduledAt', 'duration', 'method',
      'researchNotes', 'bigFourAnswers', 'tiaraQuestions',
      'completedAt', 'outcome', 'referralName', 'referralContact',
      'nextSteps', 'calendarEventId', 'userId', 'notes', 'createdAt', 'updatedAt',
    ]);
  }

  // Import EmailTemplates
  if (data.emailTemplates.length > 0) {
    console.log(`📥 Importing ${data.emailTemplates.length} email templates...`);
    await batchInsert('EmailTemplate', data.emailTemplates, [
      'id', 'name', 'type', 'subject', 'body', 'variables',
      'wordCount', 'isDefault', 'userId', 'createdAt', 'updatedAt',
    ]);
  }

  // Import ChatMessages
  if (data.chatMessages.length > 0) {
    console.log(`📥 Importing ${data.chatMessages.length} chat messages...`);
    await batchInsert('ChatMessage', data.chatMessages, [
      'id', 'role', 'content', 'metadata', 'userId', 'createdAt',
    ]);
  }

  // Import Settings
  if (data.settings.length > 0) {
    console.log(`📥 Importing ${data.settings.length} settings...`);
    await batchInsert('Settings', data.settings, [
      'id', 'userId', 'googleAccessToken', 'googleRefreshToken', 'googleTokenExpiry',
      'defaultTimezone', 'workdayStart', 'workdayEnd', 'preferredCalendarId',
      'claudeApiKey', 'createdAt', 'updatedAt',
    ]);
  }

  console.log('\n✅ Import completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   - Users: ${data.users.length}`);
  console.log(`   - Employers: ${data.employers.length}`);
  console.log(`   - Contacts: ${data.contacts.length}`);
  console.log(`   - Outreach: ${data.outreach.length}`);
  console.log(`   - Informationals: ${data.informationals.length}`);
  console.log(`   - Email Templates: ${data.emailTemplates.length}`);
  console.log(`   - Chat Messages: ${data.chatMessages.length}`);
  console.log(`   - Settings: ${data.settings.length}`);
}

// Parse command line arguments
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node import.js <path-to-migration-json>');
  process.exit(1);
}

importToD1(migrationFile).catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
