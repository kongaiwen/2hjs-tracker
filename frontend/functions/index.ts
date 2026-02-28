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
app.use('/*', usageMiddleware);

// Health check (no auth required)
app.get('/', (c) => {
  return c.json({
    name: '2HJS Tracker API',
    version: '1.0.12',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Protected API routes (require Cloudflare Access auth)
app.use('/*', authMiddleware);

// Routes (note: no /api prefix since this function is at /api/*)
app.route('/auth', authRoutes);
app.route('/employers', employerRoutes);
app.route('/contacts', contactRoutes);
app.route('/outreach', outreachRoutes);
app.route('/informationals', informationalRoutes);
app.route('/templates', templateRoutes);
app.route('/settings', settingsRoutes);
app.route('/admin', adminRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default app;
