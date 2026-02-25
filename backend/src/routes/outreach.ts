import { Router, Request, Response } from 'express';
import { PrismaClient, OutreachStatus, ContactSegment } from '@prisma/client';
import { z } from 'zod';
import { google } from 'googleapis';
import { calculate3BDate, calculate7BDate, wasResponseWithin3B } from '../utils/businessDays.js';
import { startOfDay, endOfDay } from 'date-fns';

// Helper to get authenticated Google client
async function getAuthenticatedGoogleClient(prisma: PrismaClient) {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  });

  if (!settings?.googleAccessToken) {
    return null; // Not authenticated, calendar events will be skipped
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: settings.googleAccessToken,
    refresh_token: settings.googleRefreshToken,
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.settings.update({
        where: { id: 'default' },
        data: {
          googleAccessToken: tokens.access_token,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });
    }
  });

  return oauth2Client;
}

// Helper to create a calendar event for 3B/7B reminder
async function createReminderEvent(
  calendar: any,
  summary: string,
  description: string,
  reminderDate: Date,
  calendarId: string = 'primary'
): Promise<string | null> {
  try {
    // Build offset-free datetime strings so Google Calendar interprets them
    // in the specified timeZone, regardless of server timezone
    const dateStr = reminderDate.toISOString().split('T')[0];
    const startDateTime = `${dateStr}T09:00:00`;
    const endDateTime = `${dateStr}T09:30:00`;

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/New_York',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 0 },
            { method: 'email', minutes: 30 },
          ],
        },
      },
    });

    return event.data.id || null;
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    return null;
  }
}

const router = Router();

// Validation schemas
const createOutreachSchema = z.object({
  employerId: z.string(),
  contactId: z.string(),
  subject: z.string().min(1),
  body: z.string().min(1),
  sentAt: z.string().datetime().optional(),
});

const recordResponseSchema = z.object({
  responseAt: z.string().datetime(),
  responseType: z.enum(['POSITIVE', 'NEGATIVE', 'DELAYED_POSITIVE', 'REFERRAL_ONLY', 'OUT_OF_OFFICE']),
  notes: z.string().optional(),
});

// Get all outreach
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const outreach = await prisma.outreach.findMany({
      include: {
        employer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, segment: true } }
      },
      orderBy: { sentAt: 'desc' }
    });

    res.json(outreach);
  } catch (error) {
    console.error('Error fetching outreach:', error);
    res.status(500).json({ error: 'Failed to fetch outreach' });
  }
});

// Get today's reminders (3B and 7B)
router.get('/today', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    // Get 3B reminders (need to try someone else)
    const threeBReminders = await prisma.outreach.findMany({
      where: {
        threeB_Date: { gte: todayStart, lte: todayEnd },
        status: { in: ['SENT', 'AWAITING_3B'] },
        responseAt: null
      },
      include: {
        employer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } }
      }
    });

    // Get 7B reminders (need to follow up)
    const sevenBReminders = await prisma.outreach.findMany({
      where: {
        sevenB_Date: { gte: todayStart, lte: todayEnd },
        status: { in: ['AWAITING_7B', 'MOVED_ON'] },
        responseAt: null,
        followUpSentAt: null
      },
      include: {
        employer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } }
      }
    });

    // Get overdue 3B (past but not addressed)
    const overdue3B = await prisma.outreach.findMany({
      where: {
        threeB_Date: { lt: todayStart },
        status: 'AWAITING_3B',
        responseAt: null
      },
      include: {
        employer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } }
      }
    });

    // Get overdue 7B
    const overdue7B = await prisma.outreach.findMany({
      where: {
        sevenB_Date: { lt: todayStart },
        status: 'AWAITING_7B',
        responseAt: null,
        followUpSentAt: null
      },
      include: {
        employer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } }
      }
    });

    res.json({
      threeBReminders,
      sevenBReminders,
      overdue3B,
      overdue7B,
      summary: {
        today3B: threeBReminders.length,
        today7B: sevenBReminders.length,
        overdue3B: overdue3B.length,
        overdue7B: overdue7B.length,
        totalActionRequired: threeBReminders.length + sevenBReminders.length + overdue3B.length + overdue7B.length
      }
    });
  } catch (error) {
    console.error('Error fetching today\'s reminders:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Get single outreach
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const outreach = await prisma.outreach.findUnique({
      where: { id },
      include: {
        employer: true,
        contact: true
      }
    });

    if (!outreach) {
      return res.status(404).json({ error: 'Outreach not found' });
    }

    res.json(outreach);
  } catch (error) {
    console.error('Error fetching outreach:', error);
    res.status(500).json({ error: 'Failed to fetch outreach' });
  }
});

// Create outreach (send email)
router.post('/', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const data = createOutreachSchema.parse(req.body);

    const sentAt = data.sentAt ? new Date(data.sentAt) : new Date();
    const wordCount = data.body.split(/\s+/).filter(w => w.length > 0).length;

    // Calculate 3B and 7B dates
    const threeB_Date = calculate3BDate(sentAt);
    const sevenB_Date = calculate7BDate(sentAt);

    // Get contact and employer names for calendar events
    const [contact, employer] = await Promise.all([
      prisma.contact.findUnique({ where: { id: data.contactId }, select: { name: true } }),
      prisma.employer.findUnique({ where: { id: data.employerId }, select: { name: true } }),
    ]);

    const outreach = await prisma.outreach.create({
      data: {
        employerId: data.employerId,
        contactId: data.contactId,
        subject: data.subject,
        body: data.body,
        wordCount,
        sentAt,
        threeB_Date,
        sevenB_Date,
        status: 'AWAITING_3B'
      },
      include: {
        employer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } }
      }
    });

    // Try to create calendar events for 3B and 7B reminders
    const oauth2Client = await getAuthenticatedGoogleClient(prisma);
    let calendarEvents = { threeB: null as string | null, sevenB: null as string | null };

    if (oauth2Client) {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const contactName = contact?.name || 'Contact';
      const employerName = employer?.name || 'Employer';

      // Get preferred calendar ID
      const settings = await prisma.settings.findUnique({
        where: { id: 'default' },
        select: { preferredCalendarId: true },
      });
      const calendarId = settings?.preferredCalendarId || 'primary';

      // Create 3B reminder event
      calendarEvents.threeB = await createReminderEvent(
        calendar,
        `📧 3B Checkpoint: ${contactName} (${employerName})`,
        `3 business days since initial outreach to ${contactName} at ${employerName}.\n\nNo response? Time to try a different contact at the same company.\n\nSubject: ${data.subject}`,
        threeB_Date,
        calendarId
      );

      // Create 7B reminder event
      calendarEvents.sevenB = await createReminderEvent(
        calendar,
        `📬 7B Follow-up: ${contactName} (${employerName})`,
        `7 business days since initial outreach to ${contactName} at ${employerName}.\n\nTime to send your follow-up email!\n\nOriginal subject: ${data.subject}`,
        sevenB_Date,
        calendarId
      );

      // Update outreach with calendar event IDs if created
      if (calendarEvents.threeB || calendarEvents.sevenB) {
        await prisma.outreach.update({
          where: { id: outreach.id },
          data: {
            calendarEventId: calendarEvents.threeB || calendarEvents.sevenB, // Store primary event ID
          }
        });
      }
    }

    res.status(201).json({
      ...outreach,
      calendarEvents
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating outreach:', error);
    res.status(500).json({ error: 'Failed to create outreach' });
  }
});

// Create calendar events for existing outreach (for retrigger/sync)
router.post('/:id/calendar-events', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const outreach = await prisma.outreach.findUnique({
      where: { id },
      include: {
        employer: { select: { name: true } },
        contact: { select: { name: true } }
      }
    });

    if (!outreach) {
      return res.status(404).json({ error: 'Outreach not found' });
    }

    const oauth2Client = await getAuthenticatedGoogleClient(prisma);
    if (!oauth2Client) {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const contactName = outreach.contact.name;
    const employerName = outreach.employer.name;

    // Get preferred calendar ID
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { preferredCalendarId: true },
    });
    const calendarId = settings?.preferredCalendarId || 'primary';

    let calendarEvents = { threeB: null as string | null, sevenB: null as string | null };

    // Create 3B reminder event
    calendarEvents.threeB = await createReminderEvent(
      calendar,
      `📧 3B Checkpoint: ${contactName} (${employerName})`,
      `3 business days since initial outreach to ${contactName} at ${employerName}.\n\nNo response? Time to try a different contact at the same company.\n\nSubject: ${outreach.subject}`,
      outreach.threeB_Date,
      calendarId
    );

    // Create 7B reminder event
    calendarEvents.sevenB = await createReminderEvent(
      calendar,
      `📬 7B Follow-up: ${contactName} (${employerName})`,
      `7 business days since initial outreach to ${contactName} at ${employerName}.\n\nTime to send your follow-up email!\n\nOriginal subject: ${outreach.subject}`,
      outreach.sevenB_Date,
      calendarId
    );

    // Update outreach with calendar event IDs
    if (calendarEvents.threeB || calendarEvents.sevenB) {
      await prisma.outreach.update({
        where: { id },
        data: {
          calendarEventId: calendarEvents.threeB || calendarEvents.sevenB,
        }
      });
    }

    res.json({
      success: true,
      calendarEvents,
      calendarId
    });
  } catch (error) {
    console.error('Error creating calendar events:', error);
    res.status(500).json({ error: 'Failed to create calendar events' });
  }
});

// Record response
router.post('/:id/response', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const data = recordResponseSchema.parse(req.body);
    const responseAt = new Date(data.responseAt);

    const outreach = await prisma.outreach.findUnique({
      where: { id }
    });

    if (!outreach) {
      return res.status(404).json({ error: 'Outreach not found' });
    }

    // Determine if this is a Booster (responded within 3B)
    const isBooster = wasResponseWithin3B(outreach.sentAt, responseAt);
    const segment: ContactSegment = isBooster ? 'BOOSTER' : 'OBLIGATE';

    // Update outreach and contact segment in transaction
    const [updatedOutreach] = await prisma.$transaction([
      prisma.outreach.update({
        where: { id },
        data: {
          responseAt,
          responseType: data.responseType,
          status: data.responseType === 'POSITIVE' || data.responseType === 'DELAYED_POSITIVE'
            ? 'RESPONDED'
            : 'COMPLETED',
          notes: data.notes
        }
      }),
      prisma.contact.update({
        where: { id: outreach.contactId },
        data: { segment }
      })
    ]);

    res.json({
      outreach: updatedOutreach,
      segment,
      isBooster
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error recording response:', error);
    res.status(500).json({ error: 'Failed to record response' });
  }
});

// Record follow-up (7B)
router.post('/:id/follow-up', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const { body } = req.body;

    const outreach = await prisma.outreach.update({
      where: { id },
      data: {
        followUpSentAt: new Date(),
        followUpBody: body,
        status: 'FOLLOWED_UP'
      }
    });

    res.json(outreach);
  } catch (error) {
    console.error('Error recording follow-up:', error);
    res.status(500).json({ error: 'Failed to record follow-up' });
  }
});

// Mark as moved on (3B passed, trying new contact)
router.post('/:id/move-on', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const outreach = await prisma.outreach.update({
      where: { id },
      data: { status: 'AWAITING_7B' }  // Still need to follow up at 7B
    });

    res.json(outreach);
  } catch (error) {
    console.error('Error marking as moved on:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Mark as no response (after 7B follow-up)
router.post('/:id/no-response', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const outreach = await prisma.outreach.findUnique({
      where: { id }
    });

    if (!outreach) {
      return res.status(404).json({ error: 'Outreach not found' });
    }

    // Update outreach and mark contact as Curmudgeon
    const [updatedOutreach] = await prisma.$transaction([
      prisma.outreach.update({
        where: { id },
        data: { status: 'NO_RESPONSE' }
      }),
      prisma.contact.update({
        where: { id: outreach.contactId },
        data: { segment: 'CURMUDGEON' }
      })
    ]);

    res.json(updatedOutreach);
  } catch (error) {
    console.error('Error marking as no response:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Get outreach stats
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const [totalSent, totalResponses, totalBoosters, byStatus] = await Promise.all([
      prisma.outreach.count(),
      prisma.outreach.count({ where: { responseAt: { not: null } } }),
      prisma.contact.count({ where: { segment: 'BOOSTER' } }),
      prisma.outreach.groupBy({
        by: ['status'],
        _count: true
      })
    ]);

    const responseRate = totalSent > 0 ? (totalResponses / totalSent * 100).toFixed(1) : '0';

    res.json({
      totalSent,
      totalResponses,
      totalBoosters,
      responseRate: `${responseRate}%`,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count]))
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
