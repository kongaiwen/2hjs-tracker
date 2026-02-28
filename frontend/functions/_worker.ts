/**
 * Cloudflare Pages _worker.ts
 * Handles API routes and passes everything else to static assets
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import employersRoutes from './routes/employers';
import contactsRoutes from './routes/contacts';
import outreachRoutes from './routes/outreach';
import templatesRoutes from './routes/templates';
import informationalsRoutes from './routes/informationals';
import settingsRoutes from './routes/settings';
import bulkRoutes from './routes/bulk';

const app = new Hono();

// CORS for API routes
app.use('/api/*', cors({
  origin: ['https://2hjs-tracker.pages.dev', 'https://jobsearch-tracker.kongaiwen.dev', 'http://localhost:5173'],
  credentials: true,
}));

// Auth middleware for API routes
app.use('/api/*', authMiddleware);

// Health check
app.get('/api/', (c) => {
  return c.json({
    name: '2HJS Tracker API',
    version: '1.0.12',
    status: 'healthy',
  });
});

// Mount route modules
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/employers', employersRoutes);
app.route('/api/contacts', contactsRoutes);
app.route('/api/outreach', outreachRoutes);
app.route('/api/templates', templatesRoutes);
app.route('/api/informationals', informationalsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/bulk', bulkRoutes);

// IMPORTANT: Do NOT add a catch-all route here
// Let Pages handle static assets (index.html, JS, CSS, etc.)

export default {
  fetch: (request: Request, env: any, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // Pass everything else to Pages for static asset handling
    return env.ASSETS.fetch(request);
  },
};
