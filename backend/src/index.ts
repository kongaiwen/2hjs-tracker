import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import employersRouter from './routes/employers.js';
import contactsRouter from './routes/contacts.js';
import outreachRouter from './routes/outreach.js';
import templatesRouter from './routes/templates.js';
import googleRouter from './routes/google.js';
import claudeRouter from './routes/claude.js';
import informationalsRouter from './routes/informationals.js';
import authRouter from './routes/auth.js';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'https://jobsearch.kongaiwen.dev',
  'https://jobsearch-api.kongaiwen.dev'
].filter(Boolean) as string[];

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));

// Rate limiting for auth endpoints (DISABLED for development)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // DISABLED: set very high for development
  message: 'Too many requests, please try again later'
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Make prisma available to routes
app.locals.prisma = prisma;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes (auth routes don't require authentication)
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/employers', employersRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/outreach', outreachRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/google', googleRouter);
app.use('/api/claude', claudeRouter);
app.use('/api/informationals', informationalsRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`2HJS Tracker API running on port ${PORT}`);
});

export { prisma };
