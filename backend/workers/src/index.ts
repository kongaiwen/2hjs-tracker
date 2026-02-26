/**
 * 2HJS Tracker - Cloudflare Workers API
 *
 * Serverless API backend for the job search tracker.
 * Uses Cloudflare Access for authentication (Google SSO).
 * Data stored in D1 (SQLite) with E2E encryption.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { usageMiddleware } from './middleware/usage';
import { errorHandler } from './middleware/errorHandler';

// Route modules
import authRoutes from './routes/auth';
import employerRoutes from './routes/employers';
import contactRoutes from './routes/contacts';
import outreachRoutes from './routes/outreach';
import informationalRoutes from './routes/informationals';
import templateRoutes from './routes/templates';
import settingsRoutes from './routes/settings';
import chatRoutes from './routes/chat';
import adminRoutes from './routes/admin';

// Types for Cloudflare bindings
type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string; // For admin session tokens
  ADMIN_EMAIL: string; // Email address that has admin access
};

type Variables = {
  userId: string;
  userEmail: string;
  tenantId: string;
  isAdmin: boolean;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global middleware
app.use('*', cors({
  origin: ['https://2hjs-tracker.pages.dev', 'https://jobsearch-tracker.kongaiwen.dev', 'http://localhost:5173'],
  credentials: true,
}));
app.use('*', logger());
app.use('*', errorHandler);
app.use('/api/*', usageMiddleware);

// Health check (no auth required)
app.get('/', (c) => {
  return c.json({
    name: '2HJS Tracker API',
    version: '1.0.5',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Auth routes (handled by auth middleware, but we need a me endpoint)
app.route('/api/auth', authRoutes);

// Protected API routes (require Cloudflare Access auth)
app.use('/api/*', authMiddleware);

app.route('/api/employers', employerRoutes);
app.route('/api/contacts', contactRoutes);
app.route('/api/outreach', outreachRoutes);
app.route('/api/informationals', informationalRoutes);
app.route('/api/templates', templateRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/admin', adminRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default app;
