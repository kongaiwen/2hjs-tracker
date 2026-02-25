import { nanoid } from 'nanoid';
import { PrismaClient } from '@prisma/client';
import jwt, { SignOptions } from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

export interface MagicLinkResult {
  success: boolean;
  error?: string;
  userId?: string;
  token?: string;
}

export class AuthService {
  // Generate magic link for login
  async generateLoginLink(email: string, inviteId?: string): Promise<string> {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.magicLink.create({
      data: {
        token,
        email,
        expiresAt,
        ...(inviteId && { inviteId })
      }
    });

    return `${process.env.APP_URL || 'http://localhost:5173'}/auth/verify/${token}`;
  }

  // Verify magic link and return JWT session
  async verifyMagicLink(token: string): Promise<MagicLinkResult> {
    const link = await prisma.magicLink.findUnique({ where: { token } });

    if (!link) return { success: false, error: 'Invalid token' };
    if (link.usedAt) return { success: false, error: 'Token already used' };
    if (link.expiresAt < new Date()) return { success: false, error: 'Token expired' };

    // Mark as used
    await prisma.magicLink.update({
      where: { id: link.id },
      data: { usedAt: new Date() }
    });

    // If registration flow (has inviteId)
    if (link.inviteId) {
      // Handled in registration service
      return { success: true, token: link.inviteId };
    }

    // Login flow - find or create user
    let user = await prisma.user.findUnique({ where: { email: link.email } });
    if (!user) {
      return { success: false, error: 'User not found. Please register first.' };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const sessionToken = jwt.sign(
      { userId: user.id, tenantId: user.tenantId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY } as SignOptions
    );

    return { success: true, userId: user.id, token: sessionToken };
  }

  // Create invite token
  async createInvite(options: {
    createdBy?: string;
    maxUses?: number;
    expiresIn?: number;
    allowedEmail?: string;
  }): Promise<string> {
    const token = nanoid(16);
    const expiresAt = new Date(Date.now() + (options.expiresIn || 60 * 60 * 1000));

    await prisma.invite.create({
      data: {
        token,
        maxUses: options.maxUses ?? 1,
        allowedEmail: options.allowedEmail,
        createdBy: options.createdBy,
        expiresAt
      }
    });

    return `${process.env.APP_URL || 'http://localhost:5173'}/auth/register?invite=${token}`;
  }

  // Validate invite token
  async validateInvite(token: string): Promise<{ valid: boolean; invite?: any; error?: string }> {
    const invite = await prisma.invite.findUnique({ where: { token } });

    if (!invite) return { valid: false, error: 'Invalid invite token' };
    if (!invite.active) return { valid: false, error: 'Invite has been revoked' };
    if (invite.expiresAt < new Date()) return { valid: false, error: 'Invite has expired' };
    if (invite.usedCount >= invite.maxUses) return { valid: false, error: 'Invite has been fully used' };

    return { valid: true, invite };
  }

  // Complete registration
  async completeRegistration(token: string, publicKey: string, email: string): Promise<{ success: boolean; error?: string; userId?: string; sessionToken?: string }> {
    const link = await prisma.magicLink.findFirst({
      where: { token, usedAt: { not: null } },
      include: { invite: true }
    });

    if (!link?.invite) {
      return { success: false, error: 'No invite associated with this token' };
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { success: false, error: 'User already exists' };
    }

    // Generate fingerprint from public key
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    const keyFingerprint = hash.substring(0, 16);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        publicKey,
        tenantId: `tenant_${nanoid(16)}`,
        emailVerified: true,
        keyFingerprint
      }
    });

    // Increment invite usage
    await prisma.invite.update({
      where: { id: link.invite.id! },
      data: { usedCount: { increment: 1 } }
    });

    // Create session
    const sessionToken = jwt.sign(
      { userId: user.id, tenantId: user.tenantId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY } as SignOptions
    );

    return { success: true, userId: user.id, sessionToken };
  }
}
