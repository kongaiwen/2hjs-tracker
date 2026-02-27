# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A job search tracking application implementing methodologies from Steve Dalton's book "The 2-Hour Job Search". Features include LAMP list management, contact outreach tracking (3B7 routine), informational interview preparation with TIARA framework, and E2E encrypted data storage.

## Development Commands

### Docker (Recommended - Current Stack)
```bash
# Start all services (PostgreSQL, Express backend, Vite frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Backend (Express + Prisma + PostgreSQL)
```bash
cd backend
npm install

# Database setup (first time or after schema changes)
npx prisma generate
npx prisma db push

# Development server
npm run dev
```

### Frontend (Vite + React + TypeScript)
```bash
cd frontend
npm install
npm run dev          # Development server on port 5173
npm run build        # Production build
```

### Cloudflare Deployment (Migration Target)
```bash
# Deploy backend API (Cloudflare Workers)
cd frontend/functions
npm run deploy       # Wrangler deploy

# Deploy frontend (Cloudflare Pages)
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=2hjs-tracker

# Local development with D1
cd frontend/functions
wrangler dev         # Local development with D1 and KV
```

### Database Operations
```bash
# Access PostgreSQL container directly
docker exec -it 2hjs-tracker-postgres-1 psql -U 2hjs -d 2hjs_tracker

# Backup database
cd backend
npm run export:unencrypted-data

# Run migrations (backend/src/scripts/)
node dist/scripts/migrateToAdmin.js
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

- **Pages**: `frontend/src/pages/` - Dashboard, LAMP, Contacts, Outreach, Calendar, Templates, Settings, About
- **Components**: `frontend/src/components/` - auth/, admin/, chat/, layout/
- **State**: Zustand stores in `frontend/src/stores/`
- **Services**: `frontend/src/services/` - cryptoService.ts, keyManager.ts (E2E encryption)

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
ADMIN_EMAIL      # Set via `wrangler pages secret put`
```

D1 database and KV bindings are configured in `frontend/wrangler.toml`.

## Route Patterns

### Express Backend (`/api/*`)
- `/api/auth/*` - Authentication (login, register, magic link)
- `/api/employers` - LAMP list CRUD
- `/api/contacts` - Contact management
- `/api/outreach` - 3B7 tracking, reminders
- `/api/templates` - Email templates
- `/api/informationals` - Interview tracking
- `/api/google` - Google Calendar/Gmail integration
- `/api/claude` - AI chat assistant

### Cloudflare Workers (`/api/*`)
Same route patterns, implemented in `frontend/functions/routes/` with Hono.

## Important Notes

- **E2E Encryption**: All user data is encrypted on the client before storage using Web Crypto API (RSA-OAEP)
- **Business Days**: Calendar calculations exclude weekends and holidays
- **Migration Status**: See `IMPLEMENTATION_STATUS.md` for current migration progress
- **Data Migration**: PostgreSQL backup can be imported via `backend/src/scripts/importPostgresBackup.ts`
- **Index Transpilation**: `_worker.ts` is transpiled to `_worker.js` for Cloudflare Pages Functions compatibility

## Troubleshooting

### Docker issues
```bash
# Rebuild containers after code changes
docker-compose down
docker-compose build
docker-compose up -d
```

### Prisma issues
```bash
# Regenerate client after schema changes
cd backend && npx prisma generate

# Reset database (CAUTION: destroys data)
npx prisma db push --force-reset
```

### Cloudflare Workers deployment
```bash
# View real-time logs
wrangler tail

# Test locally first
wrangler dev --local
```
