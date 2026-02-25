import { Router, Request, Response } from 'express';
import { PrismaClient, ContactSegment } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Helper to transform empty strings to null
const emptyToNull = (val: string | null | undefined) =>
  val === '' || val === undefined ? null : val;

// Validation schemas
const createContactSchema = z.object({
  employerId: z.string(),
  name: z.string().min(1),
  title: z.string().optional().nullable().transform(emptyToNull),
  email: z.string().email().optional().nullable()
    .or(z.literal('').transform(() => null)),
  linkedInUrl: z.string().url().optional().nullable()
    .or(z.literal('').transform(() => null)),
  phone: z.string().optional().nullable().transform(emptyToNull),
  isFunctionallyRelevant: z.boolean().default(false),
  isAlumni: z.boolean().default(false),
  levelAboveTarget: z.number().min(0).max(2).default(0),
  isInternallyPromoted: z.boolean().default(false),
  hasUniqueName: z.boolean().default(false),
  contactMethod: z.enum([
    'LINKEDIN_GROUP',
    'DIRECT_EMAIL_ALUMNI',
    'DIRECT_EMAIL_HUNTER',
    'FAN_MAIL',
    'LINKEDIN_CONNECT',
    'SOCIAL_MEDIA',
    'SECOND_DEGREE'
  ]).optional().nullable(),
  priority: z.number().default(1),
  notes: z.string().optional().nullable().transform(emptyToNull),
});

const updateContactSchema = createContactSchema.partial().omit({ employerId: true });

// Get all contacts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const contacts = await prisma.contact.findMany({
      where: { userId: req.user!.id },
      include: {
        employer: {
          select: { id: true, name: true }
        },
        outreach: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            sentAt: true,
            threeB_Date: true,
            sevenB_Date: true,
            followUpSentAt: true,
            responseAt: true,
            responseType: true,
            subject: true,
          }
        },
        _count: {
          select: { outreach: true, informationals: true }
        }
      },
      orderBy: [
        { employer: { motivation: 'desc' } },
        { priority: 'asc' }
      ]
    });

    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get contacts for an employer
router.get('/employer/:employerId', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const employerId = req.params.employerId as string;

    // Verify employer belongs to user
    const employer = await prisma.employer.findFirst({
      where: { id: employerId, userId: req.user!.id }
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    const contacts = await prisma.contact.findMany({
      where: { employerId, userId: req.user!.id },
      include: {
        outreach: {
          orderBy: { sentAt: 'desc' },
          take: 1
        }
      },
      orderBy: { priority: 'asc' }
    });

    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get single contact
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const contact = await prisma.contact.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        employer: true,
        outreach: {
          orderBy: { sentAt: 'desc' }
        },
        informationals: {
          orderBy: { scheduledAt: 'desc' }
        }
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// Create contact
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const data = createContactSchema.parse(req.body);

    // Verify employer belongs to user
    const employer = await prisma.employer.findFirst({
      where: { id: data.employerId, userId: req.user!.id }
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    // Get current max priority for employer
    const maxPriority = await prisma.contact.aggregate({
      where: { employerId: data.employerId, userId: req.user!.id },
      _max: { priority: true }
    });

    const contact = await prisma.contact.create({
      data: {
        ...data,
        userId: req.user!.id,
        priority: (maxPriority._max.priority || 0) + 1
      }
    });

    res.status(201).json(contact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const data = updateContactSchema.parse(req.body);

    // Verify contact belongs to user
    const existing = await prisma.contact.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = await prisma.contact.update({
      where: { id },
      data
    });

    res.json(contact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Update contact segment (based on response behavior)
router.put('/:id/segment', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const { segment } = req.body;

    if (!['UNKNOWN', 'BOOSTER', 'OBLIGATE', 'CURMUDGEON'].includes(segment)) {
      return res.status(400).json({ error: 'Invalid segment' });
    }

    // Verify contact belongs to user
    const existing = await prisma.contact.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: { segment: segment as ContactSegment }
    });

    res.json(contact);
  } catch (error) {
    console.error('Error updating segment:', error);
    res.status(500).json({ error: 'Failed to update segment' });
  }
});

// Delete contact
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    // Verify contact belongs to user
    const existing = await prisma.contact.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await prisma.contact.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Reorder contacts for an employer
router.post('/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { contactIds } = req.body;

    if (!Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'contactIds must be an array' });
    }

    // Verify all contacts belong to the user
    const count = await prisma.contact.count({
      where: {
        id: { in: contactIds },
        userId: req.user!.id
      }
    });

    if (count !== contactIds.length) {
      return res.status(403).json({ error: 'Cannot reorder contacts that do not belong to you' });
    }

    // Update priorities in order
    await prisma.$transaction(
      contactIds.map((id: string, index: number) =>
        prisma.contact.update({
          where: { id },
          data: { priority: index + 1 }
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering contacts:', error);
    res.status(500).json({ error: 'Failed to reorder contacts' });
  }
});

export default router;
