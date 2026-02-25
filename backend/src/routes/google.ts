import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';

const router = Router();

// OAuth2 client setup
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Scopes needed for Gmail and Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Get auth URL
router.get('/auth', (req: Request, res: Response) => {
  const oauth2Client = getOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  res.json({ authUrl });
});

// OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const oauth2Client = getOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in settings
    await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        id: 'default',
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/settings?google=success`);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?google=error`);
  }
});

// Check auth status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        googleAccessToken: true,
        googleTokenExpiry: true,
      },
    });

    const isAuthenticated = !!(settings?.googleAccessToken);
    const isExpired = settings?.googleTokenExpiry
      ? new Date(settings.googleTokenExpiry) < new Date()
      : true;

    res.json({
      isAuthenticated,
      isExpired: isAuthenticated ? isExpired : null,
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

// Helper to get authenticated client
async function getAuthenticatedClient(prisma: PrismaClient) {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  });

  if (!settings?.googleAccessToken) {
    throw new Error('Not authenticated with Google');
  }

  const oauth2Client = getOAuth2Client();
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

// Create Gmail draft
router.post('/gmail/draft', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
    }

    const oauth2Client = await getAuthenticatedClient(prisma);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create email message
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
        },
      },
    });

    res.json({
      draftId: draft.data.id,
      messageId: draft.data.message?.id,
    });
  } catch (error: any) {
    console.error('Error creating draft:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// Get Gmail drafts
router.get('/gmail/drafts', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const oauth2Client = await getAuthenticatedClient(prisma);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const drafts = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 20,
    });

    res.json(drafts.data.drafts || []);
  } catch (error: any) {
    console.error('Error listing drafts:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to list drafts' });
  }
});

// Send email directly via Gmail
router.post('/gmail/send', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
    }

    const oauth2Client = await getAuthenticatedClient(prisma);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create email message in RFC 2822 format
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sentMessage = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    res.json({
      messageId: sentMessage.data.id,
      threadId: sentMessage.data.threadId,
      labelIds: sentMessage.data.labelIds,
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// Create calendar event (for 3B/7B reminders)
router.post('/calendar/event', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { summary, description, startTime, endTime, calendarId } = req.body;

    if (!summary || !startTime) {
      return res.status(400).json({ error: 'Missing required fields: summary, startTime' });
    }

    // Get preferred calendar if not specified
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { preferredCalendarId: true },
    });
    const targetCalendarId = calendarId || settings?.preferredCalendarId || 'primary';

    const oauth2Client = await getAuthenticatedClient(prisma);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: {
        summary,
        description,
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: endTime
            ? new Date(endTime).toISOString()
            : new Date(new Date(startTime).getTime() + 30 * 60 * 1000).toISOString(),
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

    res.json({
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
      calendarId: targetCalendarId,
    });
  } catch (error: any) {
    console.error('Error creating event:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Get calendar events
router.get('/calendar/events', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const oauth2Client = await getAuthenticatedClient(prisma);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { preferredCalendarId: true },
    });
    const targetCalendarId = settings?.preferredCalendarId || 'primary';

    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const events = await calendar.events.list({
      calendarId: targetCalendarId,
      timeMin: now.toISOString(),
      timeMax: weekLater.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json(events.data.items || []);
  } catch (error: any) {
    console.error('Error listing events:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to list events' });
  }
});

// List available calendars (subcalendars)
router.get('/calendar/list', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const oauth2Client = await getAuthenticatedClient(prisma);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const calendarList = await calendar.calendarList.list();

    // Return simplified list with id, summary (name), and primary status
    const calendars = (calendarList.data.items || []).map((cal) => ({
      id: cal.id,
      name: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
    }));

    res.json(calendars);
  } catch (error: any) {
    console.error('Error listing calendars:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

// Delete calendar event
router.delete('/calendar/event/:eventId', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const eventId = req.params.eventId as string;
    const oauth2Client = await getAuthenticatedClient(prisma);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { preferredCalendarId: true },
    });
    const targetCalendarId = settings?.preferredCalendarId || 'primary';

    await calendar.events.delete({
      calendarId: targetCalendarId,
      eventId,
    });

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting event:', error);
    if (error.message === 'Not authenticated with Google') {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Get preferred calendar setting
router.get('/calendar/preferred', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { preferredCalendarId: true },
    });

    res.json({
      calendarId: settings?.preferredCalendarId || null
    });
  } catch (error) {
    console.error('Error getting preferred calendar:', error);
    res.status(500).json({ error: 'Failed to get preferred calendar' });
  }
});

// Set preferred calendar
router.put('/calendar/preferred', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { calendarId } = req.body;

    // calendarId may be null (meaning "use primary")
    if (calendarId !== null && typeof calendarId !== 'string') {
      return res.status(400).json({ error: 'calendarId must be a string or null' });
    }

    await prisma.settings.upsert({
      where: { id: 'default' },
      update: { preferredCalendarId: calendarId || null },
      create: { id: 'default', preferredCalendarId: calendarId || null },
    });

    res.json({ success: true, preferredCalendarId: calendarId });
  } catch (error) {
    console.error('Error setting preferred calendar:', error);
    res.status(500).json({ error: 'Failed to set preferred calendar' });
  }
});

// Revoke access
router.post('/revoke', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    await prisma.settings.update({
      where: { id: 'default' },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking access:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

export default router;
