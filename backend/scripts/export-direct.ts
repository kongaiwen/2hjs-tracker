/**
 * Direct Data Export from PostgreSQL
 *
 * Exports all data directly from the restored PostgreSQL backup.
 * This bypasses Prisma and works with the legacy schema.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DB_CONTAINER = '2hjs-tracker_postgres_1';
const DB_USER = '2hjs';
const DB_NAME = '2hjs_tracker';

function query(sql: string): string {
  return execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' }
  );
}

function queryJson(sql: string): any[] {
  const result = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' }
  );
  return result
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(row => {
      try {
        return JSON.parse(row);
      } catch {
        return row;
      }
    });
}

async function exportData() {
  console.log('🔍 Starting direct data export...\n');

  // Create a default user for migration
  const exportData: any = {
    exportedAt: new Date().toISOString(),
    users: [{
      id: 'migrated-user-1',
      email: 'user@example.com',  // Update this with your actual email
      tenantId: 'migrated-tenant-1',
      role: 'ADMIN',
      publicKey: null,  // Will be set up after migration
      keyFingerprint: null,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    }],
    employers: [],
    contacts: [],
    outreach: [],
    informationals: [],
    emailTemplates: [],
    chatMessages: [],
    settings: null,
  };

  // Export Employers
  console.log('📦 Exporting Employers...');
  const employers = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \\"Employer\\") t"`,
    { encoding: 'utf-8' }
  ).trim();
  exportData.employers = employers ? JSON.parse(employers) : [];
  console.log(`   ✓ ${exportData.employers.length} employers`);

  // Export Contacts
  console.log('📦 Exporting Contacts...');
  const contacts = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \\"Contact\\") t"`,
    { encoding: 'utf-8' }
  ).trim();
  exportData.contacts = contacts ? JSON.parse(contacts) : [];
  console.log(`   ✓ ${exportData.contacts.length} contacts`);

  // Export Outreach
  console.log('📦 Exporting Outreach...');
  const outreach = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \\"Outreach\\") t"`,
    { encoding: 'utf-8' }
  ).trim();
  exportData.outreach = outreach ? JSON.parse(outreach) : [];
  console.log(`   ✓ ${exportData.outreach.length} outreach records`);

  // Export Informationals
  console.log('📦 Exporting Informationals...');
  const informationals = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \\"Informational\\") t"`,
    { encoding: 'utf-8' }
  ).trim();
  exportData.informationals = informationals ? JSON.parse(informationals) : [];
  console.log(`   ✓ ${exportData.informationals.length} informationals`);

  // Export EmailTemplates
  console.log('📦 Exporting Email Templates...');
  const emailTemplates = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM \\"EmailTemplate\\") t"`,
    { encoding: 'utf-8' }
  ).trim();
  exportData.emailTemplates = emailTemplates ? JSON.parse(emailTemplates) : [];
  console.log(`   ✓ ${exportData.emailTemplates.length} email templates`);

  // Export Settings
  console.log('📦 Exporting Settings...');
  const settings = execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT row_to_json(t) FROM (SELECT * FROM \\"Settings\\") t"`,
    { encoding: 'utf-8' }
  ).trim();
  exportData.settings = settings ? JSON.parse(settings) : null;
  console.log(`   ✓ ${exportData.settings ? '1' : '0'} settings record`);

  // Create exports directory
  const exportDir = path.join(process.cwd(), '../exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  // Write to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `unencrypted-backup-${timestamp}.json`;
  const filepath = path.join(exportDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

  console.log('\n✅ Export completed successfully!\n');
  console.log(`📁 File saved to: ${filepath}`);
  console.log(`📏 File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB\n`);
  console.log('⚠️  IMPORTANT:');
  console.log('   1. Download and keep this backup file safe!');
  console.log('   2. Store it securely (contains sensitive data)');
  console.log('   3. You will need it if migration fails');
  console.log('   4. Update the email in the users array with your actual email');
}

exportData().catch(console.error);
