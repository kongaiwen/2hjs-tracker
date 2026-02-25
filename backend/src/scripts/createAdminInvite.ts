import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

async function createAdminInvite() {
  const token = nanoid(16);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const invite = await prisma.invite.create({
    data: {
      token,
      allowedEmail: 'REDACTED_EMAIL',
      maxUses: 1,
      expiresAt,
      active: true
    }
  });

  const appUrl = process.env.APP_URL || 'https://jobsearch.kongaiwen.dev';
  console.log(`\nAdmin registration link:\n${appUrl}/auth/register?invite=${token}`);
  console.log(`\nExpires: ${expiresAt.toISOString()}`);
}

createAdminInvite()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
