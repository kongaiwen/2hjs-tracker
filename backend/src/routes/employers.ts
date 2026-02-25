import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createEmployerSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().optional().nullable(),
  industry: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  advocacy: z.boolean().default(false),
  motivation: z.number().min(0).max(3).default(0),
  posting: z.number().min(1).max(3).default(1),
  isNetworkOrg: z.boolean().default(false),
});

const updateEmployerSchema = createEmployerSchema.partial();

// Get all employers (sorted by LAMP)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const employers = await prisma.employer.findMany({
      where: { userId: req.user!.id },
      include: {
        contacts: {
          select: { id: true, name: true, segment: true }
        },
        _count: {
          select: { outreach: true, contacts: true }
        }
      },
      orderBy: [
        { lampRank: { sort: 'asc', nulls: 'last' } },
        { motivation: 'desc' },
        { posting: 'desc' },
        { advocacy: 'desc' },
        { name: 'asc' }
      ]
    });

    res.json(employers);
  } catch (error) {
    console.error('Error fetching employers:', error);
    res.status(500).json({ error: 'Failed to fetch employers' });
  }
});

// Get single employer
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const employer = await prisma.employer.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        contacts: {
          orderBy: { priority: 'asc' }
        },
        outreach: {
          include: { contact: true },
          orderBy: { sentAt: 'desc' }
        }
      }
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    res.json(employer);
  } catch (error) {
    console.error('Error fetching employer:', error);
    res.status(500).json({ error: 'Failed to fetch employer' });
  }
});

// Create employer
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const data = createEmployerSchema.parse(req.body);

    const employer = await prisma.employer.create({
      data: {
        ...data,
        userId: req.user!.id
      }
    });

    res.status(201).json(employer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating employer:', error);
    res.status(500).json({ error: 'Failed to create employer' });
  }
});

// Update employer
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const data = updateEmployerSchema.parse(req.body);

    // First verify the employer belongs to the user
    const existing = await prisma.employer.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    const employer = await prisma.employer.update({
      where: { id },
      data
    });

    res.json(employer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating employer:', error);
    res.status(500).json({ error: 'Failed to update employer' });
  }
});

// Delete employer
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    // First verify the employer belongs to the user
    const existing = await prisma.employer.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    await prisma.employer.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting employer:', error);
    res.status(500).json({ error: 'Failed to delete employer' });
  }
});

// Get Top 5 employers (highest LAMP scores)
router.get('/top/five', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const topFive = await prisma.employer.findMany({
      where: { userId: req.user!.id, status: 'ACTIVE' },
      include: {
        contacts: {
          select: { id: true, name: true, segment: true }
        },
        outreach: {
          where: {
            status: { notIn: ['COMPLETED', 'NO_RESPONSE'] }
          }
        }
      },
      orderBy: [
        { motivation: 'desc' },
        { posting: 'desc' },
        { advocacy: 'desc' }
      ],
      take: 5
    });

    res.json(topFive);
  } catch (error) {
    console.error('Error fetching top 5:', error);
    res.status(500).json({ error: 'Failed to fetch top 5 employers' });
  }
});

// Bulk import employers
router.post('/import', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { employers } = req.body;

    if (!Array.isArray(employers)) {
      return res.status(400).json({ error: 'employers must be an array' });
    }

    const results = await prisma.employer.createMany({
      data: employers.map((e: any) => ({
        ...createEmployerSchema.parse(e),
        userId: req.user!.id
      })),
      skipDuplicates: true
    });

    res.status(201).json({ created: results.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error importing employers:', error);
    res.status(500).json({ error: 'Failed to import employers' });
  }
});

// Reorder employers (saves lampRank for manual ordering)
router.post('/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { employerIds } = req.body;

    if (!Array.isArray(employerIds)) {
      return res.status(400).json({ error: 'employerIds must be an array' });
    }

    // Verify all employers belong to the user
    const count = await prisma.employer.count({
      where: {
        id: { in: employerIds },
        userId: req.user!.id
      }
    });

    if (count !== employerIds.length) {
      return res.status(403).json({ error: 'Cannot reorder employers that do not belong to you' });
    }

    await prisma.$transaction(
      employerIds.map((id: string, index: number) =>
        prisma.employer.update({
          where: { id },
          data: { lampRank: index + 1 }
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering employers:', error);
    res.status(500).json({ error: 'Failed to reorder employers' });
  }
});

export default router;
