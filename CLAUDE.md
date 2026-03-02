# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A job search tracking application implementing methodologies from Steve Dalton's book "The 2-Hour Job Search". Features include LAMP list management, contact outreach tracking (3B7 routine), informational interview preparation with TIARA framework, and E2E encrypted data storage.

## Completion Notification

When completing tasks, send a push notification:
```bash
curl -X POST https://api.getmoshi.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"token": "uSHsgGPKtnpGWoMmeF0P3tXplQmcZmXS", "title": "Done", "message": "Brief summary", "image": "optional http url"}'
```

## Development Commands

### Docker (Recommended - Current Stack)
```bash
# Start all services (PostgreSQL, Express backend, Vite frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers (after code changes)
docker-compose down && docker-compose build && docker-compose up -d
```

### Backend (Express + Prisma + PostgreSQL)
```bash
cd backend
npm install

# Database setup (required after schema changes)
npx prisma generate
npx prisma db push

# Development server
npm run dev

# Build TypeScript
npm run build

# Data export/migration
npm run export:unencrypted-data    # Export data as JSON
npm run migrate:data               # Migrate to D1 format
```

### Frontend (Vite + React + TypeScript)
```bash
cd frontend
npm install
npm run dev          # Development server on port 5173
npm run build        # Production build (includes worker bundle)
npm run build:worker # Build only the Cloudflare Worker
npm run preview      # Preview production build
```

### Cloudflare Deployment (Migration Target)
```bash
# Local development with D1 and KV
cd frontend
wrangler pages dev

# Deploy to Cloudflare Pages (production)
npm run build
npx wrangler pages deploy dist --project-name=2hjs-tracker

# View real-time logs
wrangler tail

# Set secrets (requires Pages project)
wrangler pages secret put ADMIN_EMAIL --project-name=2hjs-tracker
```

### Database Operations
```bash
# Access PostgreSQL container directly
docker exec -it 2hjs-tracker-postgres-1 psql -U 2hjs -d 2hjs_tracker

# Interactive database browser
npx prisma studio

# Backup/export data
cd backend && npm run export:unencrypted-data

# Create admin invite (for new user registration)
cd backend && npx tsx scripts/createAdminInvite.ts
```

## Architecture

### Dual Architecture State

This codebase is in a **migration state** with two operational architectures:

1. **Current (Legacy)**: Express backend + PostgreSQL + Docker
   - Backend: `backend/src/` with Express routes
   - Database: PostgreSQL via Prisma ORM
   - Entry point: `backend/src/index.ts`

2. **Target (Cloudflare)**: Cloudflare Workers + D1 + Pages Functions
   - Backend: `frontend/functions/_worker.ts` (Hono framework)
   - Database: D1 (SQLite)
   - Entry point: `frontend/functions/_worker.js` (compiled)
   - Configuration: `frontend/wrangler.toml`

### Authentication Methods

- **Legacy**: JWT-based auth with magic links (Resend emails)
  - Middleware: `backend/src/middleware/auth.ts`
  - Routes: `backend/src/routes/auth.ts`

- **Cloudflare**: Cloudflare Access (Zero Trust)
  - Header: `CF-Access-User-Email`
  - Auth middleware in `_worker.ts`

### Key Data Models (Prisma Schema)

All data models support multi-tenancy via `userId`:
- **Employer**: LAMP scores (Advocacy Y/N, Motivation 0-3, Posting 1-3)
- **Contact**: Contact prioritization, segment classification (Booster/Obligate/Curmudgeon)
- **Outreach**: 3B7 tracking (3-business-day and 7-business-day follow-ups)
- **Informational**: TIARA framework questions, Big Four answers
- **Settings**: User preferences, API keys (Google, Claude)

### Frontend Structure

- **Pages**: `frontend/src/pages/`
  - `DashboardPage.tsx` - Overview with reminders and stats
  - `LAMPPage.tsx` - LAMP list management
  - `ContactsPage.tsx` - Contact CRUD per employer
  - `OutreachPage.tsx` - Email tracking and 3B7 follow-ups
  - `CalendarPage.tsx` - Upcoming reminders view
  - `TemplatesPage.tsx` - Email template management
  - `SettingsPage.tsx` - User preferences and API keys
  - `BulkUploadPage.tsx` - CSV import for employers/contacts

- **Components**: `frontend/src/components/`
  - `auth/` - Login, registration, key setup
  - `admin/` - Admin-only components
  - `layout/` - Navigation, header, main layout

- **Services**: `frontend/src/services/`
  - `cryptoService.ts` - RSA-OAEP encryption/decryption
  - `keyManager.ts` - IndexedDB key storage
  - `api.ts` - API client with auth interceptor

- **State**: `frontend/src/stores/authStore.ts` - Zustand store for auth state

## Core Methodology Concepts

### LAMP Method
- **L**ist: 40+ target employers
- **A**dvocacy: Y/N (alumni/affinity connections)
- **M**otivation: 0-3 (0=unfamiliar, 3=dream employer)
- **P**osting: 1-3 (1=no relevant postings, 3=very relevant)

### 3B7 Routine
- **3B**: If no response in 3 business days, try another contact at same employer
- **7B**: Follow up with original contact after 7 business days
- Business day calculations: `frontend/src/lib/businessDays.ts`

### TIARA Framework (Informational Interviews)
- **T**rends: "What trends are you seeing...?"
- **I**nsights: "What surprised you most...?"
- **A**dvice: "What advice would you give...?"
- **R**esources: "What resources do you recommend...?"
- **A**ssignments: "What should I do next...?"

## Configuration

### Required Environment Variables

**Current Stack (.env)**:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/2hjs_tracker
GOOGLE_CLIENT_ID=oauth-client-id
GOOGLE_CLIENT_SECRET=oauth-client-secret
ANTHROPIC_API_KEY=claude-api-key
JWT_SECRET=32-char-minimum-secret
FRONTEND_URL=http://localhost:5173
RESEND_API_KEY=resend-api-key
```

**Cloudflare (wrangler.toml secrets)**:
```
ADMIN_EMAIL      # Set via `wrangler pages secret put ADMIN_EMAIL --project-name=2hjs-tracker`
```

D1 database and KV bindings are configured in `frontend/wrangler.toml`.

## Route Patterns

### Express Backend (`/api/*`)
- `/api/auth/*` - Authentication (magic link, verify, register)
- `/api/employers` - LAMP list CRUD
- `/api/contacts` - Contact management
- `/api/outreach` - 3B7 tracking, reminders
- `/api/templates` - Email templates
- `/api/informationals` - Interview tracking
- `/api/admin/*` - Admin operations (bulk upload, users)

### Cloudflare Workers (`/api/*`)
Same route patterns, implemented in `frontend/functions/routes/` with Hono:
- `routes/auth.ts` - Authentication via Cloudflare Access headers
- `routes/employers.ts` - LAMP CRUD with D1
- `routes/contacts.ts` - Contact management
- `routes/outreach.ts` - 3B7 tracking
- `routes/templates.ts` - Email templates
- `routes/informationals.ts` - Interview tracking
- `routes/settings.ts` - User settings
- `routes/bulk.ts` - Bulk import/export
- `routes/admin.ts` - Admin-only operations

## Important Notes

- **E2E Encryption**: All user data is encrypted on the client before storage using Web Crypto API (RSA-OAEP)
  - Encryption keys generated in browser (`frontend/src/services/cryptoService.ts`)
  - Private keys stored in IndexedDB (`frontend/src/services/keyManager.ts`)
  - Only public key stored on server (for verification, not decryption)
  - Data encrypted before API calls, decrypted after fetch

- **Business Days**: Calendar calculations exclude weekends and holidays
  - Computed in `frontend/src/lib/businessDays.ts`
  - Used for 3B (3 business days) and 7B (7 business days) follow-up calculations

- **Migration Status**: See `IMPLEMENTATION_STATUS.md` for current migration progress
  - Dual architecture: Express/PostgreSQL (current) + Cloudflare/D1 (target)
  - Most Express routes have Cloudflare equivalents in `frontend/functions/routes/`

- **Data Migration**: PostgreSQL backup can be imported via `backend/src/scripts/importPostgresBackup.ts`

- **Worker Transpilation**: `_worker.ts` is transpiled to `_worker.js` via esbuild for Cloudflare Pages Functions compatibility
  - Build script: `npm run build:worker`
  - Output copied to `dist/_worker.js` during build

## Troubleshooting

### Docker issues
```bash
# Rebuild containers after code changes
docker-compose down
docker-compose build
docker-compose up -d

# Check container logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart specific service
docker-compose restart backend
```

### Prisma issues
```bash
# Regenerate client after schema changes
cd backend && npx prisma generate

# Reset database (CAUTION: destroys data)
npx prisma db push --force-reset

# View database in browser
npx prisma studio
```

### Cloudflare Workers deployment
```bash
# View real-time logs
wrangler tail

# Test locally with D1
wrangler pages dev --local

# Clear Workers cache
wrangler pages cache clear --project-name=2hjs-tracker
```

### Common Issues
- **CF-Access-User-Email header missing**: Cloudflare Access not configured or bypassed in dev mode
  - Set `DEV_MODE=true` in wrangler.toml vars for local development
  - Use `DEV_EMAIL` var to simulate authenticated user
- **IndexedDB errors**: Private storage may be blocked in browser; check browser settings
- **D1 query errors**: Ensure schema pushed with `wrangler d1 execute DB --file=schema.sql`
- **TypeScript errors in worker**: Ensure `_worker.ts` is transpiled before deploy
