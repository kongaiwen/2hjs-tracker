import { Router, Request, Response } from 'express';
import { PrismaClient, TemplateType } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    'SIX_POINT_INITIAL',
    'SIX_POINT_NO_CONNECTION',
    'SIX_POINT_WITH_POSTING',
    'FOLLOW_UP_7B',
    'THANK_YOU',
    'REFERRAL_REQUEST'
  ]),
  subject: z.string().min(1),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});

const generateEmailSchema = z.object({
  contactName: z.string(),
  employerName: z.string(),
  connection: z.string().optional(),
  jobTitle: z.string().optional(),
  broadInterest: z.string().optional(),
  postingTitle: z.string().optional(),
});

// Get all templates (user's templates + default templates)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const templates = await prisma.emailTemplate.findMany({
      where: { userId: req.user!.id },
      orderBy: [
        { isDefault: 'desc' },
        { type: 'asc' },
        { name: 'asc' }
      ]
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get templates by type
router.get('/type/:type', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const type = req.params.type as string;

    const templates = await prisma.emailTemplate.findMany({
      where: { userId: req.user!.id, type: type as TemplateType },
      orderBy: { isDefault: 'desc' }
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get single template
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const template = await prisma.emailTemplate.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create template
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const data = createTemplateSchema.parse(req.body);

    // Calculate word count
    const wordCount = data.body.split(/\s+/).filter(w => w.length > 0).length;

    // Extract variables from body ({{variable}} format)
    const variableMatches = data.body.match(/\{\{(\w+)\}\}/g) || [];
    const extractedVars = variableMatches.map(v => v.replace(/\{\{|\}\}/g, ''));
    const variables = [...new Set([...data.variables, ...extractedVars])];

    // If marking as default, unset other defaults of same type for this user
    if (data.isDefault) {
      await prisma.emailTemplate.updateMany({
        where: { userId: req.user!.id, type: data.type, isDefault: true },
        data: { isDefault: false }
      });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        ...data,
        userId: req.user!.id,
        wordCount,
        variables
      }
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const data = createTemplateSchema.partial().parse(req.body);

    // Verify template belongs to user
    const existing = await prisma.emailTemplate.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Recalculate word count if body changed
    let wordCount: number | undefined;
    if (data.body) {
      wordCount = data.body.split(/\s+/).filter(w => w.length > 0).length;
    }

    // If marking as default, unset other defaults of same type for this user
    if (data.isDefault && data.type) {
      await prisma.emailTemplate.updateMany({
        where: { userId: req.user!.id, type: data.type, isDefault: true, NOT: { id } },
        data: { isDefault: false }
      });
    }

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...data,
        ...(wordCount !== undefined && { wordCount })
      }
    });

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    // Verify template belongs to user
    const existing = await prisma.emailTemplate.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await prisma.emailTemplate.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Generate email from template
router.post('/:id/generate', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const vars = generateEmailSchema.parse(req.body);

    const template = await prisma.emailTemplate.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Replace variables in subject and body
    let subject = template.subject;
    let body = template.body;

    const replacements: Record<string, string> = {
      contactName: vars.contactName,
      employerName: vars.employerName,
      connection: vars.connection || '',
      jobTitle: vars.jobTitle || '',
      broadInterest: vars.broadInterest || '',
      postingTitle: vars.postingTitle || '',
    };

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    }

    // Calculate final word count
    const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;

    // Validate 6-point email rules
    const warnings: string[] = [];
    if (template.type.startsWith('SIX_POINT') && wordCount > 75) {
      warnings.push(`Word count (${wordCount}) exceeds 75-word limit for 6-Point Email`);
    }

    res.json({
      subject,
      body,
      wordCount,
      warnings,
      meetsGuidelines: warnings.length === 0
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error generating email:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

// Seed default templates
router.post('/seed', async (req: AuthRequest, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const defaultTemplates = [
      {
        name: '6-Point Email - With Connection',
        type: 'SIX_POINT_INITIAL' as TemplateType,
        subject: 'Your {{jobTitle}} experience at {{employerName}}',
        body: `Hi {{contactName}},

I'm [Your Name], {{connection}}. May I chat with you for a few minutes about your {{jobTitle}} experience at {{employerName}}?

I am trying to learn more about {{broadInterest}}, so your insights would be greatly appreciated.

Best regards,
[Your Name]`,
        variables: ['contactName', 'connection', 'jobTitle', 'employerName', 'broadInterest'],
        isDefault: true,
      },
      {
        name: '6-Point Email - No Connection',
        type: 'SIX_POINT_NO_CONNECTION' as TemplateType,
        subject: 'Your {{jobTitle}} experience at {{employerName}}',
        body: `Hi {{contactName}},

May I chat with you for a few minutes about your {{jobTitle}} experience at {{employerName}}?

I am trying to learn more about {{broadInterest}}, so your insights would be greatly appreciated.

Best regards,
[Your Name]`,
        variables: ['contactName', 'jobTitle', 'employerName', 'broadInterest'],
        isDefault: true,
      },
      {
        name: '6-Point Email - With Job Posting',
        type: 'SIX_POINT_WITH_POSTING' as TemplateType,
        subject: 'Your {{jobTitle}} experience at {{employerName}}',
        body: `Hi {{contactName}},

I'm [Your Name], {{connection}}. May I have a few minutes to ask you about your {{jobTitle}} experience at {{employerName}}?

Your insights would be greatly appreciated, since I'm now in the process of deciding whether to apply for your open {{postingTitle}} position.

Best regards,
[Your Name]`,
        variables: ['contactName', 'connection', 'jobTitle', 'employerName', 'postingTitle'],
        isDefault: true,
      },
      {
        name: '7B Follow-up',
        type: 'FOLLOW_UP_7B' as TemplateType,
        subject: 'RE: Your {{jobTitle}} experience at {{employerName}}',
        body: `Hi {{contactName}},

I just wanted to follow up on my message from last week. Might this week be a more convenient time for you to chat about your {{employerName}} experience? Please let me know if so!

Best regards,
[Your Name]`,
        variables: ['contactName', 'jobTitle', 'employerName'],
        isDefault: true,
      },
      {
        name: 'Thank You',
        type: 'THANK_YOU' as TemplateType,
        subject: 'Thank you for your time',
        body: `Hi {{contactName}},

Thank you so much for taking the time to speak with me today about {{employerName}}. Your insights about {{broadInterest}} were incredibly helpful.

I'll be sure to follow up on [specific next step they suggested].

Best regards,
[Your Name]`,
        variables: ['contactName', 'employerName', 'broadInterest'],
        isDefault: true,
      },
    ];

    for (const template of defaultTemplates) {
      const wordCount = template.body.split(/\s+/).filter(w => w.length > 0).length;
      await prisma.emailTemplate.upsert({
        where: {
          id: `default-${template.type}-${req.user!.id}`
        },
        update: {
          ...template,
          wordCount
        },
        create: {
          id: `default-${template.type}-${req.user!.id}`,
          ...template,
          userId: req.user!.id,
          wordCount
        }
      });
    }

    res.json({ success: true, seeded: defaultTemplates.length });
  } catch (error) {
    console.error('Error seeding templates:', error);
    res.status(500).json({ error: 'Failed to seed templates' });
  }
});

export default router;
