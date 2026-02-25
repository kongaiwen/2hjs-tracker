# Cloudflare Migration Guide

This guide walks through migrating the 2HJS Tracker from Express/PostgreSQL to Cloudflare Workers/D1.

## Prerequisites

1. **Cloudflare Account** with Workers paid plan ($5/month)
2. **Google Cloud Project** with OAuth credentials (or create new ones)
3. **Domain** configured on Cloudflare (`jobsearch.kongaiwen.dev`)
4. **Node.js 18+** and **npm**

## Phase 0: Pre-Migration Backup

**CRITICAL: Do this FIRST!**

```bash
# Export all your data as unencrypted JSON
cd backend
npm run export:unencrypted-data

# This creates: ../exports/unencrypted-backup-<timestamp>.json
# DOWNLOAD THIS FILE and keep it safe!
```

## Phase 1: Cloudflare Setup

### 1.1 Create D1 Database

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create 2hjs-tracker-db

# Copy the database_id from output and update wrangler.toml
```

### 1.2 Create KV Namespace

```bash
# Create KV for rate limiting and caching
wrangler kv:namespace create "2HJS_TRACKER_KV"

# Copy the id and update wrangler.toml
```

### 1.3 Configure Secrets

```bash
# Set JWT secret for admin sessions
wrangler secret put JWT_SECRET
# Enter a secure random string when prompted

# Set admin email
wrangler secret put ADMIN_EMAIL
# Enter your email address
```

### 1.4 Update wrangler.toml

Edit `backend/workers/wrangler.toml` and replace:
- `YOUR_D1_DATABASE_ID` with your actual D1 database ID
- `YOUR_KV_NAMESPACE_ID` with your actual KV namespace ID

### 1.5 Push D1 Schema

```bash
cd backend/workers
wrangler d1 execute 2hjs-tracker-db --file=schema.sql --local
wrangler d1 execute 2hjs-tracker-db --file=schema.sql
```

## Phase 2: Cloudflare Access Configuration

### 2.1 Create Zero Trust Application

1. Go to Cloudflare Dashboard → Zero Trust → Applications → Add Application
2. Select "Self-Hosted" application
3. Configure:
   - **Application name**: 2HJS Tracker
   - **Session duration**: 24 hours
   - **Destination address**: `https://jobsearch.kongaiwen.dev`

### 2.2 Configure Google OAuth

1. In Zero Trust → Settings → Authentication
2. Add "Google" identity provider
3. Configure with your Google OAuth credentials:
   - Client ID from Google Cloud Console
   - Client Secret from Google Cloud Console
   - Callback URL: `https://your-cloudflare-team.cloudflareaccess.com/cdn-cgi/access/callback`

### 2.3 Set Access Policy

1. In Zero Trust → Applications → 2HJS Tracker → Policies
2. Create policy:
   - **Action**: Allow
   - **Include**: Email domain `@gmail.com` (or `*@*` for any email)
   - **Exclude**: (optional) For admin routes, add your email only

## Phase 3: Build and Deploy

### 3.1 Install Dependencies

```bash
cd backend/workers
npm install
```

### 3.2 Deploy Workers API

```bash
cd backend/workers
npm run deploy
```

### 3.3 Build Frontend

```bash
cd frontend
npm install
npm run build
```

### 3.4 Deploy Frontend to Cloudflare Pages

```bash
cd frontend
npx wrangler pages deploy dist --project-name=2hjs-tracker
```

Or connect your GitHub repo for automatic deployments.

## Phase 4: Configure Custom Domain

### 4.1 Frontend Domain

1. In Cloudflare Pages → 2hjs-tracker → Custom Domains
2. Add: `jobsearch.kongaiwen.dev`
3. Cloudflare will automatically provision SSL

### 4.2 API Domain

The Workers API will be available at:
- `https://api.jobsearch.kongaiwen.dev`

Update frontend `.env`:
```bash
VITE_API_URL=https://api.jobsearch.kongaiwen.dev/api
```

## Phase 5: Data Migration

### 5.1 Run Migration Script

```bash
cd backend
npm run migrate:data

# This creates: ../exports/d1-migration-<timestamp>.json
```

### 5.2 Import to D1

Create an import script `backend/workers/scripts/import.ts`:

```typescript
import data from '../../exports/d1-migration-<timestamp>.json';

// For each table, batch insert into D1
// Use wrangler d1 execute with --json flag
```

Then run:
```bash
wrangler d1 execute 2hjs-tracker-db --command="INSERT INTO User ..."
```

## Phase 6: Post-Migration Verification

1. **Visit** `https://jobsearch.kongaiwen.dev`
2. **Login with Google** - Cloudflare Access will redirect you
3. **Set up encryption keys** if prompted
4. **Verify data** - Check that employers, contacts, etc. are present
5. **Test admin page** - Visit `/admin` (should work for admin email)

## Rollback Plan

If anything goes wrong:

1. **Data**: Restore from `exports/unencrypted-backup-*.json`
2. **App**: Switch DNS back to original server
3. **Database**: Continue using PostgreSQL

## Troubleshooting

### Issue: CF-Access-User-Email header not present

**Solution**: Make sure Cloudflare Access is properly configured for your domain.

### Issue: D1 queries failing

**Solution**: Check schema is properly pushed with `wrangler d1 execute`

### Issue: Workers CPU time limit exceeded

**Solution**: Optimize queries, use batch operations, increase memory allocation

### Issue: Encryption keys not working

**Solution**: Use key recovery flow with backup file from pre-migration export

## Cost Estimate

- **Workers**: $5/month (required for D1)
- **D1**: Free tier covers most use cases
- **KV**: Free tier sufficient for rate limiting
- **Pages**: Free
- **Access**: Free for first 50 users

**Starting cost**: ~$5/month
**With 100+ users**: ~$20-50/month

## Support

For issues or questions:
1. Check Cloudflare dashboard logs
2. Run `wrangler tail` to see Workers logs
3. Check D1 query metrics in Cloudflare dashboard
