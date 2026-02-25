/**
 * Restore PostgreSQL Backup and Export
 *
 * This script restores the SQL backup to PostgreSQL and then exports
 * the data in the format needed for D1 migration.
 *
 * Usage: npm run restore:backup
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKUP_FILE = path.join(process.cwd(), '../backups/backup_20260224_115721.sql');
const DB_CONTAINER = '2hjs-tracker_postgres_1';
const DB_USER = '2hjs';
const DB_NAME = '2hjs_tracker';

async function restoreBackup() {
  console.log('🔄 Starting backup restoration...\n');

  // Check if backup file exists
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`❌ Backup file not found: ${BACKUP_FILE}`);
    process.exit(1);
  }

  console.log(`📂 Found backup: ${BACKUP_FILE}`);
  console.log(`📏 File size: ${(fs.statSync(BACKUP_FILE).size / 1024).toFixed(2)} KB\n`);

  // Drop and recreate database
  console.log('🗑️  Cleaning existing database...');
  try {
    // Terminate all connections first
    execSync(
      `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"`,
      { encoding: 'utf-8' }
    );
    execSync(
      `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS \\"${DB_NAME}\\";"`,
      { encoding: 'utf-8' }
    );
    execSync(
      `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d postgres -c "CREATE DATABASE \\"${DB_NAME}\\";"`,
      { encoding: 'utf-8' }
    );
    console.log('✅ Database recreated\n');
  } catch (error) {
    console.error('❌ Failed to recreate database:', error);
    process.exit(1);
  }

  // Restore backup
  console.log('📥 Restoring backup...');
  try {
    execSync(
      `docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} < ${BACKUP_FILE}`,
      { encoding: 'utf-8', stdio: 'inherit' }
    );
    console.log('\n✅ Backup restored successfully!\n');
  } catch (error) {
    console.error('❌ Failed to restore backup:', error);
    process.exit(1);
  }

  // Check what data we have
  console.log('📊 Checking restored data...');
  const tables = [
    'Employer',
    'Contact',
    'Outreach',
    'Informational',
    'EmailTemplate',
    'ChatMessage',
    'Settings',
    'User',
  ];

  for (const table of tables) {
    try {
      const result = execSync(
        `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM \\"${table}\\";"`,
        { encoding: 'utf-8' }
      );
      const count = result.trim();
      console.log(`   ${table}: ${count}`);
    } catch {
      console.log(`   ${table}: (table not found)`);
    }
  }

  console.log('\n✅ Restoration complete!');
  console.log('📝 Next: Run npm run export:unencrypted-data to export for D1 migration');
}

restoreBackup().catch((error) => {
  console.error('❌ Restoration failed:', error);
  process.exit(1);
});
