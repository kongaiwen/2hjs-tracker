import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// System prompt for the Claude chat agent
const SYSTEM_PROMPT = `You are a helpful job search assistant specialized in the 2-Hour Job Search (2HJS) methodology by Steve Dalton. You help users manage their job search process efficiently.

Key concepts you know about:
1. LAMP List: List, Advocacy, Motivation, Posting - A prioritization system for target employers
2. Contact Segments: Boosters (respond within 3B, helpful), Obligates (delayed, reluctant), Curmudgeons (never respond)
3. 6-Point Email: Short (<75 words), asks for advice not jobs, states connection first, question format, narrow+broad interest, >50% about contact
4. 3B7 Routine: 3 Business days to try new contact, 7 Business days to follow up
5. TIARA Framework: Trends, Insights, Advice, Resources, Assignments for informational interviews

You can help users with:
- Drafting and reviewing 6-Point Emails (keep under 75 words!)
- Prioritizing their LAMP list
- Deciding when to reach out to new contacts (3B) vs follow up (7B)
- Preparing for informational interviews using TIARA
- Analyzing their outreach response rates
- Identifying potential Boosters vs Obligates based on response patterns

When helping draft emails:
- Always count words and warn if over 75
- Focus on asking for advice, not jobs
- Keep more than half the words about the contact
- Make the request a question ending in "?"
- Define interest both narrowly (the specific company) and broadly (the industry/function)

Be encouraging but realistic. The 20-40% response rate is normal. Focus on finding Boosters!`;

// Chat with Claude
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const { message, includeContext } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.Z_AI_AUTH_TOKEN;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const anthropic = new Anthropic({ apiKey, baseURL: 'https://api.z.ai/api/anthropic' });

    // Build context if requested
    let contextMessage = '';
    if (includeContext) {
      // Get relevant data for context
      const [employers, recentOutreach, stats] = await Promise.all([
        prisma.employer.findMany({
          where: { status: 'ACTIVE' },
          orderBy: [{ motivation: 'desc' }, { posting: 'desc' }],
          take: 10,
          select: { name: true, motivation: true, posting: true, advocacy: true }
        }),
        prisma.outreach.findMany({
          orderBy: { sentAt: 'desc' },
          take: 5,
          include: {
            employer: { select: { name: true } },
            contact: { select: { name: true, segment: true } }
          }
        }),
        prisma.outreach.aggregate({
          _count: { id: true },
          where: { responseAt: { not: null } }
        })
      ]);

      const totalOutreach = await prisma.outreach.count();
      const responseRate = totalOutreach > 0
        ? ((stats._count.id / totalOutreach) * 100).toFixed(1)
        : '0';

      contextMessage = `
Current job search context:
- Top employers (by LAMP): ${employers.map(e => `${e.name} (M:${e.motivation}, P:${e.posting}, A:${e.advocacy ? 'Y' : 'N'})`).join(', ')}
- Recent outreach: ${recentOutreach.map(o => `${o.contact.name} at ${o.employer.name} (${o.contact.segment || 'awaiting response'})`).join(', ')}
- Overall response rate: ${responseRate}%

User message: `;
    }

    // Get recent chat history
    const recentMessages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Build message history for Claude
    const messageHistory: Array<{ role: 'user' | 'assistant'; content: string }> = recentMessages
      .reverse()
      .filter(m => m.role !== 'SYSTEM')
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }));

    // Add current message
    const fullMessage = contextMessage + message;
    messageHistory.push({ role: 'user', content: fullMessage });

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messageHistory,
    });

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Store messages
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          role: 'USER',
          content: message, // Store original message without context
        },
      }),
      prisma.chatMessage.create({
        data: {
          role: 'ASSISTANT',
          content: assistantMessage,
        },
      }),
    ]);

    res.json({
      message: assistantMessage,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('Error chatting with Claude:', error);
    res.status(500).json({
      error: 'Failed to chat with Claude',
      details: error.message,
    });
  }
});

// Get chat history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;
    const limit = parseInt(req.query.limit as string) || 50;

    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Clear chat history
router.delete('/history', async (req: Request, res: Response) => {
  try {
    const prisma: PrismaClient = req.app.locals.prisma;

    await prisma.chatMessage.deleteMany();

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// Helper endpoint: Review email draft
router.post('/review-email', async (req: Request, res: Response) => {
  try {
    const { subject, body, contactName, employerName } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Email body is required' });
    }

    const apiKey = process.env.Z_AI_AUTH_TOKEN;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const anthropic = new Anthropic({ apiKey, baseURL: 'https://api.z.ai/api/anthropic' });

    const wordCount = body.split(/\s+/).filter((w: string) => w.length > 0).length;

    const reviewPrompt = `Please review this 6-Point Email draft for a job search outreach:

Subject: ${subject || '(no subject)'}
To: ${contactName || 'Unknown'} at ${employerName || 'Unknown'}
Body:
${body}

Word count: ${wordCount}

Please evaluate against the 6 points:
1. Under 75 words? ${wordCount <= 75 ? 'Yes' : 'No - NEEDS REVISION'}
2. Asks for insight/advice, not jobs?
3. States connection first (if applicable)?
4. Request is a question ending in "?"
5. Defines interest narrowly AND broadly?
6. More than half about the contact?

Provide specific suggestions for improvement if needed. Be concise.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: reviewPrompt }],
    });

    const review = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    res.json({
      review,
      wordCount,
      meetsWordLimit: wordCount <= 75,
    });
  } catch (error: any) {
    console.error('Error reviewing email:', error);
    res.status(500).json({
      error: 'Failed to review email',
      details: error.message,
    });
  }
});

// Helper endpoint: Generate TIARA questions
router.post('/tiara-questions', async (req: Request, res: Response) => {
  try {
    const { employerName, contactTitle, industry, yourBackground } = req.body;

    const apiKey = process.env.Z_AI_AUTH_TOKEN;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const anthropic = new Anthropic({ apiKey, baseURL: 'https://api.z.ai/api/anthropic' });

    const tiaraPrompt = `Generate TIARA questions for an informational interview.

Context:
- Employer: ${employerName || 'Unknown'}
- Contact's title: ${contactTitle || 'Unknown'}
- Industry: ${industry || 'Unknown'}
- Your background: ${yourBackground || 'Not specified'}

Generate 2 questions for each TIARA category:
- Trends: Questions about industry/company trends
- Insights: Questions seeking surprising or non-obvious information
- Advice: Questions asking for career guidance
- Resources: Questions about helpful resources, people, or tools
- Assignments: Questions about what you should do next

Format as a JSON array with categories. Questions should be specific and thoughtful, not generic.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: tiaraPrompt }],
    });

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Try to parse as JSON, or return raw
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0]);
        return res.json({ questions });
      }
    } catch {
      // If JSON parsing fails, return as structured text
    }

    res.json({ questions: content });
  } catch (error: any) {
    console.error('Error generating TIARA questions:', error);
    res.status(500).json({
      error: 'Failed to generate questions',
      details: error.message,
    });
  }
});

export default router;
