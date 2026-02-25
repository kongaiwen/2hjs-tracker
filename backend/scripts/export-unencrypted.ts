/**
 * Pre-Migration Data Export Script
 *
 * This script exports ALL user data from PostgreSQL as unencrypted JSON.
 * This should be run BEFORE any migration to Cloudflare D1.
 *
 * The exported file serves as a backup in case anything goes wrong.
 *
 * Usage: npm run export:unencrypted-data
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface ExportData {
  exportedAt: string;
  users: Array<{
    id: string;
    email: string;
    tenantId: string;
    role: string;
    publicKey: string;
    keyFingerprint: string | null;
    emailVerified: boolean;
    createdAt: string;
  }>;
  dataByUser: Array<{
    userId: string;
    email: string;
    employers: any[];
    contacts: any[];
    outreach: any[];
    informationals: any[];
    emailTemplates: any[];
    chatMessages: any[];
    settings: any;
  }>;
}

async function exportUnencryptedData() {
  console.log('🔍 Starting data export...\n');

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      tenantId: true,
      role: true,
      publicKey: true,
      keyFingerprint: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  if (users.length === 0) {
    console.log('⚠️  No users found in database!');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`📊 Found ${users.length} user(s):\n`);
  users.forEach((u) => {
    console.log(`   - ${u.email} (${u.role})`);
  });
  console.log('');

  // Export data for each user
  const dataByUser: ExportData['dataByUser'] = [];

  for (const user of users) {
    console.log(`📦 Exporting data for ${user.email}...`);

    const [
      employers,
      contacts,
      outreach,
      informationals,
      emailTemplates,
      chatMessages,
      settings,
    ] = await Promise.all([
      prisma.employer.findMany({
        where: { userId: user.id },
        include: { contacts: true },
      }),
      prisma.contact.findMany({
        where: { userId: user.id },
      }),
      prisma.outreach.findMany({
        where: { userId: user.id },
      }),
      prisma.informational.findMany({
        where: { userId: user.id },
      }),
      prisma.emailTemplate.findMany({
        where: { userId: user.id },
      }),
      prisma.chatMessage.findMany({
        where: { userId: user.id },
      }),
      prisma.settings.findUnique({
        where: { userId: user.id },
      }),
    ]);

    dataByUser.push({
      userId: user.id,
      email: user.email,
      employers,
      contacts,
      outreach,
      informationals,
      emailTemplates,
      chatMessages,
      settings,
    });

    console.log(`   ✓ Employers: ${employers.length}`);
    console.log(`   ✓ Contacts: ${contacts.length}`);
    console.log(`   ✓ Outreach: ${outreach.length}`);
    console.log(`   ✓ Informationals: ${informationals.length}`);
    console.log(`   ✓ Email Templates: ${emailTemplates.length}`);
    console.log(`   ✓ Chat Messages: ${chatMessages.length}`);
    console.log(`   ✓ Settings: ${settings ? 'Yes' : 'No'}`);
    console.log('');
  }

  // Create exports directory
  const exportDir = path.join(process.cwd(), '../exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  // Prepare export data
  const exportData: ExportData = {
    exportedAt: new Date().toISOString(),
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      tenantId: u.tenantId,
      role: u.role,
      publicKey: u.publicKey,
      keyFingerprint: u.keyFingerprint,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt.toISOString(),
    })),
    dataByUser,
  };

  // Write to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `unencrypted-backup-${timestamp}.json`;
  const filepath = path.join(exportDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

  console.log('✅ Export completed successfully!\n');
  console.log(`📁 File saved to: ${filepath}`);
  console.log(`📏 File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB\n`);
  console.log('⚠️  IMPORTANT:');
  console.log('   1. Download and keep this backup file safe!');
  console.log('   2. Store it securely (contains sensitive data)');
  console.log('   3. You may need it if migration fails');
}

exportUnencryptedData()
  .catch((error) => {
    console.error('❌ Export failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
