import express from 'express';
import { AuthService } from '../services/authService.js';
import { EmailService } from '../services/emailService.js';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';

const router = express.Router();
const authService = new AuthService();
const emailService = new EmailService();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Request magic link for login
router.post('/login/request', async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);

  const magicLink = await authService.generateLoginLink(email);
  await emailService.sendMagicLink(email, magicLink);

  res.json({ success: true, message: 'Check your email for a login link' });
});

// Verify magic link and get session
router.post('/login/verify', async (req, res) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);

  const result = await authService.verifyMagicLink(token);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // If user has placeholder keys, they need to set up keys
  if (result.userId) {
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { publicKey: true, email: true }
    });

    if (user?.publicKey === 'placeholder-will-update-on-first-login') {
      return res.json({
        token: result.token,
        userId: result.userId,
        email: user.email,
        needsKeySetup: true
      });
    }
  }

  res.json({ token: result.token, userId: result.userId });
});

// Request registration with invite
router.post('/register/request', async (req, res) => {
  const { email, inviteToken } = z.object({
    email: z.string().email(),
    inviteToken: z.string()
  }).parse(req.body);

  // Validate invite
  const validation = await authService.validateInvite(inviteToken);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Check email against allowedEmail if set
  if (validation.invite.allowedEmail && validation.invite.allowedEmail !== email) {
    return res.status(400).json({ error: 'This invite is for a different email address' });
  }

  // Generate magic link for registration
  const magicLink = await authService.generateLoginLink(email, validation.invite.id);

  await emailService.sendMagicLink(email, magicLink);

  res.json({ success: true });
});

// Complete registration (after magic link verified)
router.post('/register/complete', async (req, res) => {
  const { token, publicKey, email } = z.object({
    token: z.string(),
    publicKey: z.string(), // PEM-formatted public key
    email: z.string().email()
  }).parse(req.body);

  const result = await authService.completeRegistration(token, publicKey, email);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ token: result.sessionToken, userId: result.userId });
});

// Validate invite token (public - for frontend validation before showing form)
router.get('/invites/validate/:token', async (req, res) => {
  const { token } = req.params;
  const validation = await authService.validateInvite(token);
  res.json(validation);
});

// Create invite (authenticated - admins only)
router.post('/invites/create', authenticate, async (req: any, res) => {
  const { maxUses = 50, expiresIn = 60 * 60 * 1000 } = req.body; // Default: 50 uses, 1 hour

  // Check if user is admin
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can create invites' });
  }

  const inviteUrl = await authService.createInvite({
    createdBy: req.user.id,
    maxUses,
    expiresIn
  });

  res.json({ inviteUrl });
});

// Get current user
router.get('/me', authenticate, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, createdAt: true, keyFingerprint: true }
  });
  res.json(user);
});

export default router;
