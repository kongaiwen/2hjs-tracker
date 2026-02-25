# 2HJS Tracker

A job search tracking application implementing methodologies from Steve Dalton's book "The 2-Hour Job Search" (Harvard Business Review Press).

## Features

- **LAMP Method**: Employer prioritization using advocacy, motivation, posting quality, and personal fit
- **Contact Management**: Track and prioritize contacts at target companies
- **Outreach Tracking**: Monitor emails with automatic 3-business-day and 7-business-day follow-up reminders
- **Informational Interviews**: Prepare and track networking conversations
- **TIARA Framework**: Generate questions using trends, insights, advice, resources, and assignments
- **E2E Encryption**: All job search data is encrypted on your device before storage
- **Claude AI Integration**: Chat assistance and question generation

## Tech Stack

### Current Implementation
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + Prisma + PostgreSQL
- **Authentication**: Google OAuth (magic link email verification)

### Cloudflare Migration (Ready to Deploy)
- **Frontend**: Cloudflare Pages
- **Backend**: Cloudflare Workers + Hono framework
- **Database**: D1 (SQLite)
- **Authentication**: Cloudflare Access (Google SSO)

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/kongaiwen/2hjs-tracker.git
cd 2hjs-tracker

# Copy environment file and configure
cp .env.example .env
# Edit .env with your configuration

# Start the application
docker-compose up -d

# Access the app at http://localhost:5173
```

### Manual Setup

#### Prerequisites
- Node.js 18+
- PostgreSQL 16
- npm or yarn

#### Backend Setup

```bash
cd backend
npm install
cp ../.env.example ../.env
# Configure DATABASE_URL and other variables in .env

npx prisma generate
npx prisma db push

npm run dev
```

#### Frontend Setup

```bash
cd frontend
npm install
npm run dev

# Access at http://localhost:5173
```

## Configuration

Required environment variables (see `.env.example`):

- `DATABASE_URL`: PostgreSQL connection string
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `ANTHROPIC_API_KEY`: Claude API key for AI features
- `JWT_SECRET`: Secret key for JWT tokens
- `RESEND_API_KEY`: Resend API key for emails

## Legal Notice

This application is inspired by concepts from "The 2-Hour Job Search" by Steve Dalton. This is an independent implementation and is not affiliated with, endorsed by, or sponsored by the author or publisher.

## License

MIT License - See LICENSE file for details

## Migration to Cloudflare

See [CLOUDFLARE_MIGRATION_GUIDE.md](CLOUDFLARE_MIGRATION_GUIDE.md) for detailed instructions on migrating to the serverless architecture.
