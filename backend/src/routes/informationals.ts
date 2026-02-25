import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma, InformationalOutcome, MeetingMethod } from '@prisma/client';
import { google } from 'googleapis';

const router = Router();

// Helper to get authenticated Google client
async function getAuthenticatedClient(prisma: PrismaClient) {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  });

  if (!settings?.googleAccessToken) {
    return null;
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

// Get user timezone from settings
async function getUserTimezone(prisma: PrismaClient): Promise<string> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
    select: { defaultTimezone: true },
  });
  return settings?.defaultTimezone || 'America/New_York';
}

// List all informationals with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { contactId, employerId, status, from, to } = req.query;

    const where: any = {};

    if (contactId) {
      where.contactId = contactId;
    }

    if (employerId) {
      where.contact = { employerId };
    }

    // Filter by status: upcoming, completed, all
    if (status === 'upcoming') {
      where.completedAt = null;
      where.scheduledAt = { gte: new Date() };
    } else if (status === 'completed') {
      where.completedAt = { not: null };
    } else if (status === 'past') {
      where.completedAt = null;
      where.scheduledAt = { lt: new Date() };
    }

    // Date range filter
    if (from || to) {
      where.scheduledAt = {
        ...(from && { gte: new Date(from as string) }),
        ...(to && { lte: new Date(to as string) }),
      };
    }

    const informationals = await prisma.informational.findMany({
      where,
      include: {
        contact: {
          include: {
            employer: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json(informationals);
  } catch (error) {
    console.error('Error fetching informationals:', error);
    res.status(500).json({ error: 'Failed to fetch informationals' });
  }
});

// Get upcoming informationals for dashboard/digest
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { days = '7' } = req.query;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(days as string, 10));

    const informationals = await prisma.informational.findMany({
      where: {
        completedAt: null,
        scheduledAt: {
          gte: new Date(),
          lte: endDate,
        },
      },
      include: {
        contact: {
          include: {
            employer: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json(informationals);
  } catch (error) {
    console.error('Error fetching upcoming informationals:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming informationals' });
  }
});

// Get daily digest - today's informationals and reminders
router.get('/digest', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's informationals
    const todayInformationals = await prisma.informational.findMany({
      where: {
        scheduledAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    // This week's upcoming
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const thisWeekInformationals = await prisma.informational.findMany({
      where: {
        completedAt: null,
        scheduledAt: {
          gte: tomorrow,
          lte: weekEnd,
        },
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    // Overdue (scheduled in past but not completed)
    const overdueInformationals = await prisma.informational.findMany({
      where: {
        completedAt: null,
        scheduledAt: { lt: today },
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    // Needs preparation (scheduled within 3 days, no TIARA questions)
    const prepDeadline = new Date(today);
    prepDeadline.setDate(prepDeadline.getDate() + 3);

    const needsPrepInformationals = await prisma.informational.findMany({
      where: {
        completedAt: null,
        scheduledAt: {
          gte: today,
          lte: prepDeadline,
        },
        OR: [
          { tiaraQuestions: { equals: Prisma.DbNull } },
          { researchNotes: null },
        ],
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({
      today: todayInformationals,
      thisWeek: thisWeekInformationals,
      overdue: overdueInformationals,
      needsPreparation: needsPrepInformationals,
      summary: {
        todayCount: todayInformationals.length,
        weekCount: thisWeekInformationals.length,
        overdueCount: overdueInformationals.length,
        needsPrepCount: needsPrepInformationals.length,
      },
    });
  } catch (error) {
    console.error('Error fetching digest:', error);
    res.status(500).json({ error: 'Failed to fetch digest' });
  }
});

// Get single informational
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;

    const informational = await prisma.informational.findUnique({
      where: { id },
      include: {
        contact: {
          include: {
            employer: true,
            outreach: {
              orderBy: { sentAt: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    if (!informational) {
      return res.status(404).json({ error: 'Informational not found' });
    }

    res.json(informational);
  } catch (error) {
    console.error('Error fetching informational:', error);
    res.status(500).json({ error: 'Failed to fetch informational' });
  }
});

// Create informational with optional Google Calendar event
router.post('/', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const {
      contactId,
      scheduledAt,
      duration = 30,
      method = 'PHONE',
      researchNotes,
      tiaraQuestions,
      createCalendarEvent = true,
      notes,
    } = req.body;

    if (!contactId || !scheduledAt) {
      return res.status(400).json({ error: 'contactId and scheduledAt are required' });
    }

    // Get contact info for calendar event
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { employer: true },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    let calendarEventId: string | undefined;
    let calendarHtmlLink: string | undefined;

    // Create Google Calendar event if requested and authenticated
    if (createCalendarEvent) {
      const oauth2Client = await getAuthenticatedClient(prisma);
      if (oauth2Client) {
        try {
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const timezone = await getUserTimezone(prisma);

          // Use a floating local datetime (no Z/offset) so Google Calendar
          // interprets it in the user's timezone rather than as absolute UTC.
          const localStart = scheduledAt.slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
          const endMs = new Date(localStart + 'Z').getTime() + duration * 60 * 1000;
          const localEnd = new Date(endMs).toISOString().slice(0, 19);

          const methodLabel = method === 'VIDEO' ? '📹 Video' : method === 'IN_PERSON' ? '🤝 In-Person' : '📞 Phone';

          const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: `${methodLabel} Informational: ${contact.name} (${contact.employer?.name})`,
              description: `Informational interview with ${contact.name}${contact.title ? `, ${contact.title}` : ''} at ${contact.employer?.name}.\n\nPrepare your TIARA questions!\n\n2HJS Tracker`,
              start: {
                dateTime: localStart,
                timeZone: timezone,
              },
              end: {
                dateTime: localEnd,
                timeZone: timezone,
              },
              reminders: {
                useDefault: false,
                overrides: [
                  { method: 'popup', minutes: 60 },
                  { method: 'popup', minutes: 15 },
                  { method: 'email', minutes: 1440 }, // 24 hours before
                ],
              },
            },
          });

          calendarEventId = event.data.id || undefined;
          calendarHtmlLink = event.data.htmlLink || undefined;
        } catch (calError) {
          console.error('Failed to create calendar event:', calError);
          // Continue without calendar event
        }
      }
    }

    const informational = await prisma.informational.create({
      data: {
        contactId,
        scheduledAt: new Date(scheduledAt),
        duration,
        method: method as MeetingMethod,
        researchNotes,
        tiaraQuestions,
        calendarEventId,
        notes,
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
    });

    res.status(201).json({
      ...informational,
      calendarHtmlLink,
    });
  } catch (error) {
    console.error('Error creating informational:', error);
    res.status(500).json({ error: 'Failed to create informational' });
  }
});

// Update informational (reschedule, update prep, etc.)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const {
      scheduledAt,
      duration,
      method,
      researchNotes,
      bigFourAnswers,
      tiaraQuestions,
      notes,
      updateCalendar = true,
    } = req.body;

    const existing = await prisma.informational.findUnique({
      where: { id },
      include: { contact: { include: { employer: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Informational not found' });
    }

    // Update Google Calendar if rescheduled and has calendarEventId
    if (updateCalendar && existing.calendarEventId && scheduledAt) {
      const oauth2Client = await getAuthenticatedClient(prisma);
      if (oauth2Client) {
        try {
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const timezone = await getUserTimezone(prisma);

          const localStart = scheduledAt.slice(0, 19);
          const endMs = new Date(localStart + 'Z').getTime() + (duration || existing.duration) * 60 * 1000;
          const localEnd = new Date(endMs).toISOString().slice(0, 19);

          await calendar.events.patch({
            calendarId: 'primary',
            eventId: existing.calendarEventId,
            requestBody: {
              start: {
                dateTime: localStart,
                timeZone: timezone,
              },
              end: {
                dateTime: localEnd,
                timeZone: timezone,
              },
            },
          });
        } catch (calError) {
          console.error('Failed to update calendar event:', calError);
        }
      }
    }

    const informational = await prisma.informational.update({
      where: { id },
      data: {
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
        ...(duration && { duration }),
        ...(method && { method: method as MeetingMethod }),
        ...(researchNotes !== undefined && { researchNotes }),
        ...(bigFourAnswers !== undefined && { bigFourAnswers }),
        ...(tiaraQuestions !== undefined && { tiaraQuestions }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
    });

    res.json(informational);
  } catch (error) {
    console.error('Error updating informational:', error);
    res.status(500).json({ error: 'Failed to update informational' });
  }
});

// Complete informational with outcome
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const {
      outcome,
      referralName,
      referralContact,
      nextSteps,
      notes,
    } = req.body;

    if (!outcome) {
      return res.status(400).json({ error: 'outcome is required' });
    }

    const informational = await prisma.informational.update({
      where: { id },
      data: {
        completedAt: new Date(),
        outcome: outcome as InformationalOutcome,
        referralName,
        referralContact,
        nextSteps,
        notes,
      },
      include: {
        contact: {
          include: { employer: true },
        },
      },
    });

    // If referral offered, could create a new contact automatically
    // (optional enhancement)

    res.json(informational);
  } catch (error) {
    console.error('Error completing informational:', error);
    res.status(500).json({ error: 'Failed to complete informational' });
  }
});

// Delete informational (and optionally calendar event)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const id = req.params.id as string;
    const deleteCalendarEvent = req.query.deleteCalendarEvent !== 'false';

    const informational = await prisma.informational.findUnique({
      where: { id },
    });

    if (!informational) {
      return res.status(404).json({ error: 'Informational not found' });
    }

    // Delete Google Calendar event if exists
    if (deleteCalendarEvent && informational.calendarEventId) {
      const oauth2Client = await getAuthenticatedClient(prisma);
      if (oauth2Client) {
        try {
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: informational.calendarEventId,
          });
        } catch (calError) {
          console.error('Failed to delete calendar event:', calError);
        }
      }
    }

    await prisma.informational.delete({ where: { id } });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting informational:', error);
    res.status(500).json({ error: 'Failed to delete informational' });
  }
});

// Get available time slots (check Google Calendar for free/busy)
router.get('/availability/slots', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { date, duration = '30' } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const oauth2Client = await getAuthenticatedClient(prisma);
    if (!oauth2Client) {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const timezone = await getUserTimezone(prisma);
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { workdayStart: true, workdayEnd: true },
    });

    const workStart = settings?.workdayStart || '09:00';
    const workEnd = settings?.workdayEnd || '17:00';
    const slotDuration = parseInt(duration as string, 10);

    // Parse the date and set up time boundaries
    const dayStart = new Date(`${date}T${workStart}:00`);
    const dayEnd = new Date(`${date}T${workEnd}:00`);

    // Get existing events for that day
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busyTimes = (events.data.items || []).map((event) => ({
      start: new Date(event.start?.dateTime || event.start?.date || ''),
      end: new Date(event.end?.dateTime || event.end?.date || ''),
    }));

    // Generate available slots
    const slots: { start: string; end: string }[] = [];
    let currentTime = new Date(dayStart);

    while (currentTime < dayEnd) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration * 60 * 1000);

      if (slotEnd > dayEnd) break;

      // Check if slot overlaps with any busy time
      const isAvailable = !busyTimes.some(
        (busy) => currentTime < busy.end && slotEnd > busy.start
      );

      if (isAvailable) {
        slots.push({
          start: currentTime.toISOString(),
          end: slotEnd.toISOString(),
        });
      }

      // Move to next slot (30 min increments)
      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000);
    }

    res.json({
      date,
      timezone,
      workHours: { start: workStart, end: workEnd },
      duration: slotDuration,
      availableSlots: slots,
      busyTimes: busyTimes.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Sync Google Calendar events (pull events into our system)
router.post('/calendar/sync', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { days = 30 } = req.body;

    const oauth2Client = await getAuthenticatedClient(prisma);
    if (!oauth2Client) {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Get all calendar events
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Get all our informationals with calendar IDs
    const informationals = await prisma.informational.findMany({
      where: {
        calendarEventId: { not: null },
        scheduledAt: {
          gte: now,
          lte: endDate,
        },
      },
      select: {
        id: true,
        calendarEventId: true,
        scheduledAt: true,
      },
    });

    const calendarEventIds = new Set(informationals.map((i) => i.calendarEventId));
    const googleEventIds = new Set((events.data.items || []).map((e) => e.id));

    // Find informationals whose calendar events were deleted
    const orphanedInformationals = informationals.filter(
      (i) => i.calendarEventId && !googleEventIds.has(i.calendarEventId)
    );

    // Find calendar events that might be informationals (contain "Informational" in title)
    const unmatchedCalendarEvents = (events.data.items || []).filter(
      (e) =>
        e.summary?.toLowerCase().includes('informational') &&
        e.id &&
        !calendarEventIds.has(e.id)
    );

    res.json({
      synced: true,
      googleEventsCount: events.data.items?.length || 0,
      informationalsCount: informationals.length,
      orphanedInformationals: orphanedInformationals.map((i) => ({
        id: i.id,
        scheduledAt: i.scheduledAt,
        calendarEventId: i.calendarEventId,
      })),
      unmatchedCalendarEvents: unmatchedCalendarEvents.map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
      })),
    });
  } catch (error: any) {
    console.error('Error syncing calendar:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

export default router;
