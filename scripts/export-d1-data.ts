/**
 * Export ALL data from Cloudflare D1 production database
 * Usage: npx tsx scripts/export-d1-data.ts
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DB_NAME = '2hjs-tracker-db';
const EXPORT_DIR = path.join(process.cwd(), 'exports');

interface D1Result<T = any> {
  results: T[];
}

function d1Query<T = any>(command: string): T[] {
  try {
    const output = execSync(
      `wrangler d1 execute ${DB_NAME} --command="${command}" --json`,
      { encoding: 'utf-8' }
    );
    const parsed = JSON.parse(output) as D1Result<T>[];
    return parsed[0]?.results || [];
  } catch (error: any) {
    console.error(`Query failed: ${command}`);
    console.error(error.stderr?.toString() || error.message);
    return [];
  }
}

function exportTable<T = any>(tableName: string): T[] {
  console.log(`📥 Exporting ${tableName}...`);
  const data = d1Query<T>(`SELECT * FROM "${tableName}"`);
  console.log(`   ✓ ${data.length} rows`);
  return data;
}

async function main() {
  console.log('🔄 Starting D1 export...\n');

  // Create export directory
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  // Export all tables
  const data = {
    users: exportTable('User'),
    employers: exportTable('Employer'),
    contacts: exportTable('Contact'),
    outreach: exportTable('Outreach'),
    informationals: exportTable('Informational'),
    emailTemplates: exportTable('EmailTemplate'),
    chatMessages: exportTable('ChatMessage'),
    settings: exportTable('Settings'),
  };

  console.log('\n📊 Summary:');
  console.log(`   - Users: ${data.users.length}`);
  console.log(`   - Employers: ${data.employers.length}`);
  console.log(`   - Contacts: ${data.contacts.length}`);
  console.log(`   - Outreach: ${data.outreach.length}`);
  console.log(`   - Informationals: ${data.informationals.length}`);
  console.log(`   - Email Templates: ${data.emailTemplates.length}`);
  console.log(`   - Chat Messages: ${data.chatMessages.length}`);
  console.log(`   - Settings: ${data.settings.length}`);

  // Write to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `d1-export-${timestamp}.json`;
  const filepath = path.join(EXPORT_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

  console.log(`\n✅ Export saved to: ${filepath}`);
  console.log(`📏 File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
}

main().catch(console.error);
