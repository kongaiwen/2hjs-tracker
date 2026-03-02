/**
 * Google OAuth and API Routes
 * Handles Gmail draft creation and Calendar event management
 */

import { Hono } from 'hono';

const app = new Hono();

// Scopes needed for Gmail and Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * Get OAuth2 authorization URL
 * GET /api/google/auth
 */
app.get('/auth', async (c) => {
  const userId = c.get('userId');
  const redirectUri = c.env.GOOGLE_REDIRECT_URI || `https://${c.req.header('host')}/api/google/callback`;

  // Create a state parameter that includes the userId for security and identification
  const state = encodeURIComponent(JSON.stringify({ userId, timestamp: Date.now() }));

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state: state,
  })}`;

  return c.json({ authUrl });
});

/**
 * Handle OAuth callback
 * GET /api/google/callback?code={authorization_code}&state={encoded_user_id}
 */
app.get('/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const state = c.req.query('state');

  // Get the frontend URL for redirect
  const frontendUrl = c.env.FRONTEND_URL || `https://${c.req.header('host')?.replace(/\/api\/google\/callback.*/, '')}` || 'https://2hjs-tracker.pages.dev';

  if (error) {
    // User denied authorization - redirect to settings with error
    return c.redirect(`${frontendUrl}/settings?google=error`);
  }

  if (!code) {
    return c.redirect(`${frontendUrl}/settings?google=error`);
  }

  try {
    // Extract userId from state parameter
    let userId: string;
    try {
      const stateData = JSON.parse(decodeURIComponent(state || ''));
      userId = stateData.userId;
    } catch {
      // Fallback: try to get userId from auth middleware (for direct API calls during testing)
      userId = c.get('userId');
    }

    if (!userId) {
      console.error('OAuth callback: No userId found in state or auth middleware');
      return c.redirect(`${frontendUrl}/settings?google=error`);
    }

    const redirectUri = c.env.GOOGLE_REDIRECT_URI || `${frontendUrl}/api/google/callback`;

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return c.redirect(`${frontendUrl}/settings?google=error`);
    }

    const tokens = await tokenResponse.json();

    // Calculate token expiry
    const expiryDate = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Store tokens in Settings table
    await c.env.DB.prepare(`
      UPDATE Settings
      SET googleAccessToken = ?, googleRefreshToken = ?, googleTokenExpiry = ?, updatedAt = datetime('now')
      WHERE userId = ?
    `).bind(tokens.access_token, tokens.refresh_token || null, expiryDate, userId).run();

    // Redirect to settings page with success flag
    return c.redirect(`${frontendUrl}/settings?google=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.redirect(`${frontendUrl}/settings?google=error`);
  }
});

/**
 * Check auth status
 * GET /api/google/status
 */
app.get('/status', async (c) => {
  const userId = c.get('userId');

  const settings = await c.env.DB.prepare(`
    SELECT googleAccessToken, googleTokenExpiry FROM Settings WHERE userId = ?
  `).bind(userId).first();

  const isAuthenticated = !!(settings?.googleAccessToken);
  const isExpired = settings?.googleTokenExpiry
    ? new Date(settings.googleTokenExpiry) < new Date()
    : true;

  return c.json({
    isAuthenticated,
    isExpired: isAuthenticated ? isExpired : null,
  });
});

/**
 * Revoke access
 * POST /api/google/revoke
 */
app.post('/revoke', async (c) => {
  const userId = c.get('userId');

  await c.env.DB.prepare(`
    UPDATE Settings
    SET googleAccessToken = NULL, googleRefreshToken = NULL, googleTokenExpiry = NULL, updatedAt = datetime('now')
    WHERE userId = ?
  `).bind(userId).run();

  return c.json({ success: true });
});

/**
 * Helper function to get fresh access token
 * Handles token refresh if needed
 */
async function getAccessToken(c: any, userId: string): Promise<string> {
  const settings = await c.env.DB.prepare(`
    SELECT googleAccessToken, googleRefreshToken, googleTokenExpiry FROM Settings WHERE userId = ?
  `).bind(userId).first();

  if (!settings?.googleAccessToken) {
    throw new Error('Not authenticated with Google');
  }

  // Check if token needs refresh (expired or will expire in 5 minutes)
  const needsRefresh = settings.googleTokenExpiry
    ? new Date(settings.googleTokenExpiry) < new Date(Date.now() + 5 * 60 * 1000)
    : true;

  if (needsRefresh && settings.googleRefreshToken) {
    // Refresh the token
    const redirectUri = c.env.GOOGLE_REDIRECT_URI || `https://${c.req.header('host')}/api/google/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: settings.googleRefreshToken,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to refresh access token');
    }

    const tokens = await tokenResponse.json();

    // Update stored tokens
    const expiryDate = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await c.env.DB.prepare(`
      UPDATE Settings
      SET googleAccessToken = ?, googleTokenExpiry = ?, updatedAt = datetime('now')
      WHERE userId = ?
    `).bind(tokens.access_token, expiryDate, userId).run();

    return tokens.access_token;
  }

  return settings.googleAccessToken;
}

/**
 * Helper to encode email to RFC 822 format and base64url
 */
function encodeEmail(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create Gmail draft
 * POST /api/google/gmail/draft
 * Body: { to, subject, body }
 */
app.post('/gmail/draft', async (c) => {
  const userId = c.get('userId');
  const { to, subject, body } = await c.req.json();

  if (!to || !subject || !body) {
    return c.json({ error: 'Missing required fields: to, subject, body' }, 400);
  }

  try {
    const accessToken = await getAccessToken(c, userId);

    const encodedMessage = encodeEmail(to, subject, body);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          raw: encodedMessage,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gmail draft creation failed:', errorText);
      return c.json({ error: 'Failed to create Gmail draft' }, 500);
    }

    const draft = await response.json();

    return c.json({
      draftId: draft.id,
      messageId: draft.message?.id,
    });
  } catch (error: any) {
    console.error('Gmail draft error:', error);
    if (error.message === 'Not authenticated with Google' || error.message === 'Failed to refresh access token') {
      return c.json({ error: 'Not authenticated with Google' }, 401);
    }
    return c.json({ error: 'Failed to create Gmail draft' }, 500);
  }
});

/**
 * Create calendar event
 * POST /api/google/calendar/event
 * Body: { summary, description, startTime, endTime, calendarId }
 */
app.post('/calendar/event', async (c) => {
  const userId = c.get('userId');
  const { summary, description, startTime, endTime, calendarId } = await c.req.json();

  if (!summary || !startTime) {
    return c.json({ error: 'Missing required fields: summary, startTime' }, 400);
  }

  try {
    const accessToken = await getAccessToken(c, userId);

    // Get preferred calendar if not specified
    const settings = await c.env.DB.prepare(`
      SELECT preferredCalendarId FROM Settings WHERE userId = ?
    `).bind(userId).first();

    const targetCalendarId = calendarId || settings?.preferredCalendarId || 'primary';

    const eventBody = {
      summary,
      description: description || '',
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
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${targetCalendarId}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Calendar event creation failed:', errorText);
      return c.json({ error: 'Failed to create calendar event' }, 500);
    }

    const event = await response.json();

    return c.json({
      eventId: event.id,
      htmlLink: event.htmlLink,
      calendarId: targetCalendarId,
    });
  } catch (error: any) {
    console.error('Calendar event error:', error);
    if (error.message === 'Not authenticated with Google' || error.message === 'Failed to refresh access token') {
      return c.json({ error: 'Not authenticated with Google' }, 401);
    }
    return c.json({ error: 'Failed to create calendar event' }, 500);
  }
});

/**
 * Get calendar events
 * GET /api/google/calendar/events
 */
app.get('/calendar/events', async (c) => {
  const userId = c.get('userId');

  try {
    const accessToken = await getAccessToken(c, userId);

    // Get preferred calendar
    const settings = await c.env.DB.prepare(`
      SELECT preferredCalendarId FROM Settings WHERE userId = ?
    `).bind(userId).first();

    const targetCalendarId = settings?.preferredCalendarId || 'primary';

    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${targetCalendarId}/events?` +
      new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        maxResults: '50',
        singleEvents: 'true',
        orderBy: 'startTime',
      }),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return c.json({ error: 'Failed to list events' }, 500);
    }

    const data = await response.json();

    return c.json(data.items || []);
  } catch (error: any) {
    console.error('Calendar events error:', error);
    if (error.message === 'Not authenticated with Google' || error.message === 'Failed to refresh access token') {
      return c.json({ error: 'Not authenticated with Google' }, 401);
    }
    return c.json({ error: 'Failed to list events' }, 500);
  }
});

/**
 * List available calendars
 * GET /api/google/calendar/list
 */
app.get('/calendar/list', async (c) => {
  const userId = c.get('userId');

  try {
    const accessToken = await getAccessToken(c, userId);

    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return c.json({ error: 'Failed to list calendars' }, 500);
    }

    const data = await response.json();

    // Return simplified list
    const calendars = (data.items || []).map((cal: any) => ({
      id: cal.id,
      name: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
    }));

    return c.json(calendars);
  } catch (error: any) {
    console.error('Calendar list error:', error);
    if (error.message === 'Not authenticated with Google' || error.message === 'Failed to refresh access token') {
      return c.json({ error: 'Not authenticated with Google' }, 401);
    }
    return c.json({ error: 'Failed to list calendars' }, 500);
  }
});

/**
 * Delete calendar event
 * DELETE /api/google/calendar/event/:eventId
 */
app.delete('/calendar/event/:eventId', async (c) => {
  const userId = c.get('userId');
  const eventId = c.req.param('eventId');

  try {
    const accessToken = await getAccessToken(c, userId);

    // Get preferred calendar
    const settings = await c.env.DB.prepare(`
      SELECT preferredCalendarId FROM Settings WHERE userId = ?
    `).bind(userId).first();

    const targetCalendarId = settings?.preferredCalendarId || 'primary';

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${targetCalendarId}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return c.json({ error: 'Failed to delete event' }, 500);
    }

    return c.body(null, 204);
  } catch (error: any) {
    console.error('Calendar delete error:', error);
    if (error.message === 'Not authenticated with Google' || error.message === 'Failed to refresh access token') {
      return c.json({ error: 'Not authenticated with Google' }, 401);
    }
    return c.json({ error: 'Failed to delete event' }, 500);
  }
});

/**
 * Get preferred calendar
 * GET /api/google/calendar/preferred
 */
app.get('/calendar/preferred', async (c) => {
  const userId = c.get('userId');

  const settings = await c.env.DB.prepare(`
    SELECT preferredCalendarId FROM Settings WHERE userId = ?
  `).bind(userId).first();

  return c.json({
    calendarId: settings?.preferredCalendarId || null,
  });
});

/**
 * Set preferred calendar
 * PUT /api/google/calendar/preferred
 * Body: { calendarId }
 */
app.put('/calendar/preferred', async (c) => {
  const userId = c.get('userId');
  const { calendarId } = await c.req.json();

  // calendarId may be null (meaning "use primary")
  if (calendarId !== null && typeof calendarId !== 'string') {
    return c.json({ error: 'calendarId must be a string or null' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE Settings
    SET preferredCalendarId = ?, updatedAt = datetime('now')
    WHERE userId = ?
  `).bind(calendarId || null, userId).run();

  return c.json({ success: true, preferredCalendarId: calendarId });
});

export default app;
