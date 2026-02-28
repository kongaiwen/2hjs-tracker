import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.error('ADMIN_EMAIL environment variable is required');
  process.exit(1);
}

async function migrateToAdmin() {
  console.log('Starting migration to admin user...');

  // 1. Create admin user with placeholder keys (will update after first login)
  console.log(`Creating admin user: ${ADMIN_EMAIL}`);

  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: 'ADMIN',  // Set admin role
      tenantId: `tenant_${nanoid(16)}`,
      publicKey: 'placeholder-will-update-on-first-login',
    }
  });

  console.log(`Admin user created with ID: ${adminUser.id}`);

  // 2. Migrate all existing data to admin user
  // Employers
  const employerCount = await prisma.employer.count({ where: { userId: null } });
  if (employerCount > 0) {
    console.log(`Migrating ${employerCount} Employers...`);
    await prisma.employer.updateMany({
      where: { userId: null },
      data: { userId: adminUser.id }
    });
  }

  // Contacts
  const contactCount = await prisma.contact.count({ where: { userId: null } });
  if (contactCount > 0) {
    console.log(`Migrating ${contactCount} Contacts...`);
    await prisma.contact.updateMany({
      where: { userId: null },
      data: { userId: adminUser.id }
    });
  }

  // Outreach
  const outreachCount = await prisma.outreach.count({ where: { userId: null } });
  if (outreachCount > 0) {
    console.log(`Migrating ${outreachCount} Outreach...`);
    await prisma.outreach.updateMany({
      where: { userId: null },
      data: { userId: adminUser.id }
    });
  }

  // Informationals
  const informationalCount = await prisma.informational.count({ where: { userId: null } });
  if (informationalCount > 0) {
    console.log(`Migrating ${informationalCount} Informationals...`);
    await prisma.informational.updateMany({
      where: { userId: null },
      data: { userId: adminUser.id }
    });
  }

  // EmailTemplates
  const emailTemplateCount = await prisma.emailTemplate.count({ where: { userId: null } });
  if (emailTemplateCount > 0) {
    console.log(`Migrating ${emailTemplateCount} EmailTemplates...`);
    await prisma.emailTemplate.updateMany({
      where: { userId: null },
      data: { userId: adminUser.id }
    });
  }

  // ChatMessages
  const chatMessageCount = await prisma.chatMessage.count({ where: { userId: null } });
  if (chatMessageCount > 0) {
    console.log(`Migrating ${chatMessageCount} ChatMessages...`);
    await prisma.chatMessage.updateMany({
      where: { userId: null },
      data: { userId: adminUser.id }
    });
  }

  // 3. Migrate Settings (special case - only one record)
  const settings = await prisma.settings.findFirst();
  if (settings && !settings.userId) {
    console.log('Migrating Settings...');
    await prisma.settings.update({
      where: { id: settings.id },
      data: { userId: adminUser.id }
    });
  }

  console.log('Migration complete!');
  console.log(`\nAdmin user ID: ${adminUser.id}`);
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log('\nNext: Create an invite token for the admin to complete registration.');
}

migrateToAdmin()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
