/**
 * PostgreSQL to D1 Migration Script
 *
 * This script migrates data from PostgreSQL to D1 (SQLite) format.
 * It exports data in a format that can be imported into Cloudflare D1.
 *
 * Usage: npm run migrate:data
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

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

/**
 * Convert PostgreSQL date to SQLite format
 */
function toSQLiteDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}

/**
 * Convert PostgreSQL enum to string
 */
function enumToString(enumValue: any): string {
  return enumValue?.toString() || null;
}

/**
 * Sanitize data for D1 (remove circular references, convert dates, etc.)
 */
function sanitizeForD1(data: any): any {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;

  // Handle Date objects
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(sanitizeForD1);
  }

  // Handle objects - create a new object without prototypes
  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip undefined values
    if (value === undefined) continue;

    // Skip internal Prisma fields
    if (key.startsWith('_')) continue;

    sanitized[key] = sanitizeForD1(value);
  }

  return sanitized;
}

async function migrateToD1() {
  console.log('🔄 Starting migration to D1 format...\n');

  // Get all users
  const users = await prisma.user.findMany();
  console.log(`📊 Found ${users.length} user(s)\n`);

  // Get all data
  const [
    allEmployers,
    allContacts,
    allOutreach,
    allInformationals,
    allEmailTemplates,
    allChatMessages,
    allSettings,
  ] = await Promise.all([
    prisma.employer.findMany(),
    prisma.contact.findMany(),
    prisma.outreach.findMany(),
    prisma.informational.findMany(),
    prisma.emailTemplate.findMany(),
    prisma.chatMessage.findMany(),
    prisma.settings.findMany(),
  ]);

  console.log('📦 Data summary:');
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Employers: ${allEmployers.length}`);
  console.log(`   - Contacts: ${allContacts.length}`);
  console.log(`   - Outreach: ${allOutreach.length}`);
  console.log(`   - Informationals: ${allInformationals.length}`);
  console.log(`   - Email Templates: ${allEmailTemplates.length}`);
  console.log(`   - Chat Messages: ${allChatMessages.length}`);
  console.log(`   - Settings: ${allSettings.length}`);
  console.log('');

  // Prepare migration data
  const migrationData: D1MigrationData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    users: users.map((u) => sanitizeForD1({
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      tenantId: u.tenantId,
      role: u.role,
      publicKey: u.publicKey,
      keyFingerprint: u.keyFingerprint,
      keyCreatedAt: u.keyCreatedAt,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      // New fields for Cloudflare migration
      encryptedData: null,  // Will be filled during E2E setup
      dataVersion: 0,
      storageUsed: 0,
      requestCount: 0,
      lastRequestAt: null,
      firstSeenAt: u.createdAt,
    })),
    employers: allEmployers.map((e) => sanitizeForD1({
      ...e,
      status: enumToString(e.status),
    })),
    contacts: allContacts.map((c) => sanitizeForD1({
      ...c,
      contactMethod: c.contactMethod ? enumToString(c.contactMethod) : null,
      segment: enumToString(c.segment),
    })),
    outreach: allOutreach.map((o) => sanitizeForD1({
      ...o,
      responseType: o.responseType ? enumToString(o.responseType) : null,
      status: enumToString(o.status),
    })),
    informationals: allInformationals.map((i) => sanitizeForD1({
      ...i,
      method: enumToString(i.method),
      outcome: i.outcome ? enumToString(i.outcome) : null,
    })),
    emailTemplates: allEmailTemplates.map((t) => sanitizeForD1({
      ...t,
      type: enumToString(t.type),
    })),
    chatMessages: allChatMessages.map((m) => sanitizeForD1({
      ...m,
      role: enumToString(m.role),
    })),
    settings: allSettings.map((s) => sanitizeForD1(s)),
  };

  // Create exports directory
  const exportDir = path.join(process.cwd(), '../exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  // Write migration file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `d1-migration-${timestamp}.json`;
  const filepath = path.join(exportDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(migrationData, null, 2));

  console.log('✅ Migration data prepared!\n');
  console.log(`📁 File saved to: ${filepath}`);
  console.log(`📏 File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB\n`);
  console.log('📝 Next steps:');
  console.log('   1. Create D1 database: wrangler d1 create 2hjs-tracker-db');
  console.log('   2. Push schema: wrangler d1 execute 2hjs-tracker-db --file=schema.sql');
  console.log('   3. Import this file using the import script');
}

migrateToD1()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
