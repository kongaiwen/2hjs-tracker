/**
 * Admin Routes
 *
 * Protected admin endpoints for monitoring usage and managing users.
 */

import { Hono } from 'hono';
import { adminMiddleware } from '../middleware/auth';

const app = new Hono();

// All admin routes require admin role
app.use('*', adminMiddleware);

// Get admin dashboard stats
app.get('/stats', async (c) => {
  const DB = c.env.DB;

  const [userCount, activeUsers, totalStorage, totalRequests] = await Promise.all([
    DB.prepare('SELECT COUNT(*) as count FROM User').first<{ count: number }>(),
    DB.prepare(`SELECT COUNT(*) as count FROM User WHERE lastLoginAt > datetime('now', '-30 days')`)
      .first<{ count: number }>(),
    DB.prepare('SELECT SUM(storageUsed) as total FROM User').first<{ total: number | null }>(),
    DB.prepare('SELECT SUM(requestCount) as total FROM User').first<{ total: number | null }>(),
  ]);

  // Get recent activity
  const recentActivity = await DB.prepare(`
    SELECT metricType, value, timestamp, User.email
    FROM UsageMetrics
    JOIN User ON UsageMetrics.userId = User.id
    ORDER BY timestamp DESC
    LIMIT 50
  `).all();

  return c.json({
    stats: {
      totalUsers: userCount?.count || 0,
      activeUsers30Days: activeUsers?.count || 0,
      totalStorageUsed: totalStorage?.total || 0,
      totalRequestsMonth: totalRequests?.total || 0,
    },
    recentActivity: recentActivity.results,
  });
});

// Get all users with usage data
app.get('/users', async (c) => {
  const DB = c.env.DB;

  const users = await DB.prepare(`
    SELECT id, email, role, storageUsed, requestCount, lastRequestAt,
           firstSeenAt, lastLoginAt, dataVersion
    FROM User
    ORDER BY createdAt DESC
  `).all();

  return c.json({ users: users.results });
});

// Get detailed usage for a specific user
app.get('/users/:userId/usage', async (c) => {
  const DB = c.env.DB;
  const userId = c.req.param('userId');

  const metrics = await DB.prepare(`
    SELECT * FROM UsageMetrics
    WHERE userId = ?
    ORDER BY timestamp DESC
    LIMIT 100
  `).bind(userId).all();

  return c.json({ metrics: metrics.results });
});

export default app;
