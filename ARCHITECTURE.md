# 2-Hour Job Search Tracker - Architecture Document

## Overview

A comprehensive job search management application based on Steve Dalton's "2-Hour Job Search" methodology. The app provides structured tracking for the LAMP list, contact outreach via the 3B7 routine, and integrated Google services for email/calendar automation.

## Core Methodology Concepts

### LAMP List
- **L**ist: Target employers (40+ minimum)
- **A**dvocacy: Y/N - do you have alumni/affinity connections?
- **M**otivation: 0-3 scale (0=unfamiliar, 1=least motivated, 2=moderate, 3=dream employer)
- **P**osting: 1-3 scale (1=no relevant postings, 2=somewhat relevant, 3=very relevant)

### Contact Segments
- **Boosters**: Respond within 3 business days, genuinely want to help
- **Obligates**: Delayed responses, help reluctantly, negative ROI
- **Curmudgeons**: Never respond

### 6-Point Email Template
1. Write fewer than 75 words
2. Ask for insight/advice, NOT job leads
3. State connection first
4. Make request as a question (ending in "?")
5. Define interest narrowly AND broadly
6. Keep >50% word count about the CONTACT

### 3B7 Routine
- **3B (3 Business Days)**: If no response, try another contact at same employer
- **7B (7 Business Days)**: Follow up with original contact

### TIARA Framework (for informationals)
- **T**rends: "What trends are you seeing in...?"
- **I**nsights: "What surprised you most about...?"
- **A**dvice: "What advice would you give...?"
- **R**esources: "What resources do you recommend...?"
- **A**ssignments: "What should I do next...?"

---

## Technical Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Containerization**: Docker + Docker Compose
- **API Integrations**: Google Mail API, Google Calendar API
- **AI Integration**: Claude API for chat agent

### Directory Structure

```
2hjs-tracker/
├── docker-compose.yml
├── Dockerfile.frontend
├── Dockerfile.backend
├── .env.example
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── ui/              # shadcn components
│       │   ├── lamp/            # LAMP list components
│       │   │   ├── LAMPTable.tsx
│       │   │   ├── EmployerRow.tsx
│       │   │   ├── AddEmployerModal.tsx
│       │   │   └── LAMPScoreEditor.tsx
│       │   ├── contacts/        # Contact management
│       │   │   ├── ContactList.tsx
│       │   │   ├── ContactCard.tsx
│       │   │   └── ContactSegmentBadge.tsx
│       │   ├── outreach/        # 3B7 tracking
│       │   │   ├── OutreachTracker.tsx
│       │   │   ├── TimelineView.tsx
│       │   │   ├── ReminderCard.tsx
│       │   │   └── EmailComposer.tsx
│       │   ├── templates/       # Email templates
│       │   │   ├── SixPointEmail.tsx
│       │   │   └── FollowUpEmail.tsx
│       │   ├── dashboard/       # Analytics
│       │   │   ├── Dashboard.tsx
│       │   │   ├── ResponseRateChart.tsx
│       │   │   ├── PipelineView.tsx
│       │   │   └── ActivityCalendar.tsx
│       │   ├── chat/            # Claude agent
│       │   │   ├── ChatPanel.tsx
│       │   │   └── MessageBubble.tsx
│       │   └── layout/
│       │       ├── Sidebar.tsx
│       │       ├── Header.tsx
│       │       └── MainLayout.tsx
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── LAMPPage.tsx
│       │   ├── ContactsPage.tsx
│       │   ├── OutreachPage.tsx
│       │   ├── TemplatesPage.tsx
│       │   └── SettingsPage.tsx
│       ├── stores/
│       │   ├── employerStore.ts
│       │   ├── contactStore.ts
│       │   ├── outreachStore.ts
│       │   └── settingsStore.ts
│       ├── hooks/
│       │   ├── useGoogleAuth.ts
│       │   ├── useGmailDraft.ts
│       │   ├── useCalendarEvents.ts
│       │   └── useClaudeChat.ts
│       ├── lib/
│       │   ├── api.ts
│       │   ├── utils.ts
│       │   └── businessDays.ts
│       └── types/
│           └── index.ts
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── app.ts
│       ├── routes/
│       │   ├── employers.ts
│       │   ├── contacts.ts
│       │   ├── outreach.ts
│       │   ├── templates.ts
│       │   ├── google.ts
│       │   └── claude.ts
│       ├── controllers/
│       │   ├── employerController.ts
│       │   ├── contactController.ts
│       │   ├── outreachController.ts
│       │   └── claudeController.ts
│       ├── services/
│       │   ├── googleMailService.ts
│       │   ├── googleCalendarService.ts
│       │   ├── claudeService.ts
│       │   └── reminderService.ts
│       ├── middleware/
│       │   ├── auth.ts
│       │   └── errorHandler.ts
│       └── utils/
│           ├── businessDays.ts
│           └── emailValidator.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── scripts/
    ├── setup.sh
    └── 2hjs-tracker.service   # systemd service file
```

---

## Database Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Employer {
  id          String    @id @default(cuid())
  name        String
  website     String?
  industry    String?
  location    String?
  notes       String?

  // LAMP scores
  advocacy    Boolean   @default(false)  // Y/N
  motivation  Int       @default(0)      // 0-3
  posting     Int       @default(1)      // 1-3

  // Computed rank (for sorting)
  lampRank    Int?

  // Status
  status      EmployerStatus @default(ACTIVE)

  contacts    Contact[]
  outreach    Outreach[]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

enum EmployerStatus {
  ACTIVE
  ON_HOLD
  RULED_OUT
  OFFER_RECEIVED
}

model Contact {
  id              String    @id @default(cuid())
  employer        Employer  @relation(fields: [employerId], references: [id])
  employerId      String

  name            String
  title           String?
  email           String?
  linkedInUrl     String?
  phone           String?

  // Contact prioritization
  isFunctionallyRelevant  Boolean @default(false)
  isAlumni                Boolean @default(false)
  levelAboveTarget        Int     @default(0)  // 0, 1, or 2 levels above
  isInternallyPromoted    Boolean @default(false)
  hasUniqueName           Boolean @default(false)

  // Contact method
  contactMethod   ContactMethod?

  // Segment determination (based on response behavior)
  segment         ContactSegment?

  // Priority order within employer
  priority        Int       @default(1)

  outreach        Outreach[]
  informationals  Informational[]

  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum ContactMethod {
  LINKEDIN_GROUP
  DIRECT_EMAIL_ALUMNI
  DIRECT_EMAIL_HUNTER
  FAN_MAIL
  LINKEDIN_CONNECT
  SOCIAL_MEDIA
  SECOND_DEGREE
}

enum ContactSegment {
  UNKNOWN
  BOOSTER       // Responded within 3B
  OBLIGATE      // Responded after 3B or unhelpful
  CURMUDGEON    // Never responded after 7B follow-up
}

model Outreach {
  id              String    @id @default(cuid())
  employer        Employer  @relation(fields: [employerId], references: [id])
  employerId      String
  contact         Contact   @relation(fields: [contactId], references: [id])
  contactId       String

  // Email details
  subject         String
  body            String
  wordCount       Int

  // Tracking
  sentAt          DateTime
  threeB_Date     DateTime  // 3 business days later
  sevenB_Date     DateTime  // 7 business days later

  // Response tracking
  responseAt      DateTime?
  responseType    ResponseType?

  // Follow-up tracking
  followUpSentAt  DateTime?
  followUpBody    String?

  // Status
  status          OutreachStatus @default(SENT)

  // Google integration
  gmailDraftId    String?
  gmailMessageId  String?
  calendarEventId String?   // For 3B/7B reminders

  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum ResponseType {
  POSITIVE        // Agreed to informational
  NEGATIVE        // Declined
  DELAYED_POSITIVE
  REFERRAL_ONLY   // Offered to forward resume only
  OUT_OF_OFFICE
}

enum OutreachStatus {
  DRAFT
  SENT
  AWAITING_3B     // Waiting for 3B checkpoint
  MOVED_ON        // 3B passed, trying new contact
  AWAITING_7B     // Waiting for 7B follow-up
  FOLLOWED_UP     // 7B follow-up sent
  RESPONDED       // Got a response
  SCHEDULED       // Informational scheduled
  COMPLETED       // Process complete for this contact
  NO_RESPONSE     // No response after follow-up
}

model Informational {
  id              String    @id @default(cuid())
  contact         Contact   @relation(fields: [contactId], references: [id])
  contactId       String

  scheduledAt     DateTime
  duration        Int       @default(30)  // minutes
  method          MeetingMethod @default(PHONE)

  // Preparation
  researchNotes   String?
  bigFourAnswers  Json?     // { tellMeAboutYourself, whyOrg, whyRole, whyIndustry }

  // TIARA questions prepared
  tiaraQuestions  Json?

  // Outcome
  completedAt     DateTime?
  outcome         InformationalOutcome?
  referralName    String?
  referralContact String?
  nextSteps       String?

  // Google integration
  calendarEventId String?

  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum MeetingMethod {
  PHONE
  VIDEO
  IN_PERSON
}

enum InformationalOutcome {
  REFERRAL_OFFERED
  NO_REFERRAL
  FOLLOW_UP_SCHEDULED
  DEAD_END
}

model EmailTemplate {
  id          String    @id @default(cuid())
  name        String
  type        TemplateType
  subject     String
  body        String
  variables   String[]  // e.g., ["contactName", "employerName", "connection"]
  wordCount   Int
  isDefault   Boolean   @default(false)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

enum TemplateType {
  SIX_POINT_INITIAL
  SIX_POINT_NO_CONNECTION
  SIX_POINT_WITH_POSTING
  FOLLOW_UP_7B
  THANK_YOU
  REFERRAL_REQUEST
}

model Settings {
  id                    String    @id @default(cuid())

  // Google OAuth tokens
  googleAccessToken     String?
  googleRefreshToken    String?
  googleTokenExpiry     DateTime?

  // User preferences
  defaultTimezone       String    @default("America/New_York")
  workdayStart          String    @default("09:00")
  workdayEnd            String    @default("17:00")

  // Claude API
  claudeApiKey          String?

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

model ChatMessage {
  id          String    @id @default(cuid())
  role        ChatRole
  content     String
  metadata    Json?     // For tool calls, context, etc.

  createdAt   DateTime  @default(now())
}

enum ChatRole {
  USER
  ASSISTANT
  SYSTEM
}
```

---

## API Endpoints

### Employers
- `GET /api/employers` - List all employers (sortable by LAMP)
- `POST /api/employers` - Create employer
- `PUT /api/employers/:id` - Update employer/LAMP scores
- `DELETE /api/employers/:id` - Delete employer
- `POST /api/employers/sort` - Recalculate LAMP rankings

### Contacts
- `GET /api/contacts` - List all contacts
- `GET /api/contacts/employer/:id` - Get contacts for employer
- `POST /api/contacts` - Create contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `PUT /api/contacts/:id/segment` - Update contact segment

### Outreach
- `GET /api/outreach` - List all outreach
- `GET /api/outreach/today` - Get today's reminders (3B/7B)
- `POST /api/outreach` - Create outreach record
- `PUT /api/outreach/:id` - Update outreach
- `POST /api/outreach/:id/follow-up` - Record follow-up
- `POST /api/outreach/:id/response` - Record response

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `POST /api/templates/:id/generate` - Generate email from template

### Google Integration
- `GET /api/google/auth` - Start OAuth flow
- `GET /api/google/callback` - OAuth callback
- `POST /api/google/gmail/draft` - Create Gmail draft
- `POST /api/google/calendar/event` - Create calendar event
- `GET /api/google/calendar/events` - Get calendar events

### Claude Chat
- `POST /api/claude/chat` - Send message to Claude
- `GET /api/claude/history` - Get chat history
- `DELETE /api/claude/history` - Clear chat history

---

## Key Features

### 1. LAMP List Management
- Sortable table with L-A-M-P columns
- Drag-and-drop reordering
- Auto-ranking based on M > P > A sort order
- Quick-edit inline scores
- Import from CSV/spreadsheet

### 2. Contact Management
- Priority-based contact list per employer
- Contact method tracking
- Segment auto-classification based on response time
- LinkedIn profile integration

### 3. 3B7 Tracking System
- Visual timeline of outreach status
- Automatic 3B/7B date calculation (business days only)
- Today's reminders dashboard widget
- Calendar integration for reminder events
- Status progression: Sent → Awaiting 3B → Moved On/Responded → Awaiting 7B → Followed Up → Completed

### 4. Email Composition
- 6-Point Email template wizard
- Word count validator (must be <75)
- Variable substitution (contact name, employer, connection)
- Gmail draft creation
- Send tracking

### 5. Dashboard & Analytics
- Response rate by employer/method
- Pipeline visualization (funnel)
- Activity heatmap calendar
- Top 5 employer status cards
- Upcoming reminders list

### 6. Claude Chat Agent
- Conversational interface
- Context-aware (knows LAMP list, outreach history)
- Can help draft emails
- Can suggest next actions
- Code editing capability for templates

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/2hjs_tracker"

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3001/api/google/callback"

# Claude API
ANTHROPIC_API_KEY="your-claude-api-key"

# App
NODE_ENV="development"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

---

## Docker Configuration

### docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-2hjs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-2hjs_secret}
      POSTGRES_DB: ${POSTGRES_DB:-2hjs_tracker}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-2hjs}"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-2hjs}:${POSTGRES_PASSWORD:-2hjs_secret}@postgres:5432/${POSTGRES_DB:-2hjs_tracker}
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 3001
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GOOGLE_REDIRECT_URI: ${GOOGLE_REDIRECT_URI}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    environment:
      VITE_API_URL: http://localhost:3001
    ports:
      - "5173:5173"
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

---

## Systemd Service

```ini
# /etc/systemd/user/2hjs-tracker.service
[Unit]
Description=2-Hour Job Search Tracker
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/home/evie-marie/Projects/2hjs-tracker
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

To enable auto-start on login:
```bash
systemctl --user enable 2hjs-tracker.service
systemctl --user start 2hjs-tracker.service
loginctl enable-linger evie-marie
```
