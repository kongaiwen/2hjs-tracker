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

// Calculate actual storage used by a user across all data tables
async function calculateUserStorage(DB: any, userId: string): Promise<number> {
  const tables = [
    { table: 'Employer', cols: ['name', 'website', 'industry', 'location', 'notes', 'encryptedData'] },
    { table: 'Contact', cols: ['name', 'title', 'email', 'linkedInUrl', 'phone', 'notes', 'encryptedData'] },
    { table: 'Outreach', cols: ['subject', 'body', 'followUpBody', 'encryptedData'] },
    { table: 'Informational', cols: ['researchNotes', 'bigFourAnswers', 'tiaraQuestions', 'nextSteps', 'encryptedData'] },
    { table: 'EmailTemplate', cols: ['name', 'subject', 'body', 'variables', 'encryptedData'] },
    { table: 'Settings', cols: ['encryptedData'] },
  ];

  let total = 0;
  for (const { table, cols } of tables) {
    const sumExpr = cols.map(c => `COALESCE(LENGTH(${c}), 0)`).join(' + ');
    const result = await DB.prepare(
      `SELECT COALESCE(SUM(${sumExpr}), 0) as bytes FROM ${table} WHERE userId = ?`
    ).bind(userId).first<{ bytes: number }>();
    total += result?.bytes || 0;
  }
  return total;
}

// Get admin dashboard stats
app.get('/stats', async (c) => {
  const DB = c.env.DB;

  const [userCount, activeUsers, totalRequests] = await Promise.all([
    DB.prepare('SELECT COUNT(*) as count FROM User').first<{ count: number }>(),
    DB.prepare(`SELECT COUNT(*) as count FROM User WHERE lastLoginAt > datetime('now', '-30 days')`)
      .first<{ count: number }>(),
    DB.prepare('SELECT SUM(requestCount) as total FROM User').first<{ total: number | null }>(),
  ]);

  // Calculate total storage across all users
  const allUsers = await DB.prepare('SELECT id FROM User').all();
  let totalStorage = 0;
  for (const user of allUsers.results as any[]) {
    totalStorage += await calculateUserStorage(DB, user.id);
  }

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
      totalStorageUsed: totalStorage,
      totalRequestsMonth: totalRequests?.total || 0,
    },
    recentActivity: recentActivity.results,
  });
});

// Get all users with usage data
app.get('/users', async (c) => {
  const DB = c.env.DB;

  const users = await DB.prepare(`
    SELECT id, email, role, requestCount, lastRequestAt,
           firstSeenAt, lastLoginAt, dataVersion
    FROM User
    ORDER BY createdAt DESC
  `).all();

  // Calculate actual storage for each user
  const usersWithStorage = await Promise.all(
    (users.results as any[]).map(async (user) => ({
      ...user,
      storageUsed: await calculateUserStorage(DB, user.id),
    }))
  );

  return c.json({ users: usersWithStorage });
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

// Delete a user and all their data
app.delete('/users/:userId', async (c) => {
  const DB = c.env.DB;
  const requesterId = c.get('userId');
  const targetUserId = c.req.param('userId');

  if (targetUserId === requesterId) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }

  await DB.prepare('DELETE FROM EmailTemplate WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM Informational WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM Outreach WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM Contact WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM Employer WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM Settings WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM UsageMetrics WHERE userId = ?').bind(targetUserId).run();
  await DB.prepare('DELETE FROM User WHERE id = ?').bind(targetUserId).run();

  return c.json({ success: true });
});

export default app;
