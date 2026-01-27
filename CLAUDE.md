# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReplyFlow is a Node.js/Express backend for Instagram automation. It monitors Instagram posts/reels for comments containing specific keywords and automatically sends direct messages to matching commenters.

## Commands

```bash
# Development
npm run dev          # Start with nodemon (auto-reload)
npm start            # Production server

# Database
npm run migrate      # Run Prisma migrations
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma studio    # Visual database browser
```

## Architecture

### Request Flow
```
Routes → Middleware (auth, validation) → Controllers → Services → Prisma/Database
```

### Core Automation Pipeline
1. **CommentPoller** (`services/instagram/commentPoller.js`) polls Instagram every 30 seconds
2. **KeywordMatcher** (`services/instagram/keywordMatcher.js`) checks comments against configured keywords
3. Matches are queued in `DmQueue` table
4. Background worker sends DMs respecting per-account rate limits
5. Results tracked in `DmHistory` and `DailyAnalytics`

### Instagram Integration (services/instagram/)
Three API approaches coexist:
- **instagramAPI.js** - Official Instagram Graph API wrapper
- **commentAPI.js** - Web scraping API using captured sessions
- **cookieCapture.js** - Puppeteer with stealth plugin for session capture

Session handling uses cookies + CSRF tokens extracted from Instagram web.

### Database
- **ORM:** Prisma with PostgreSQL
- **Schema:** `prisma/schema.prisma` defines all models
- **Note:** Both `pg` Pool and Prisma Client are used - the pg pool is in `src/config/database.js`

### Key Models
- `User` - Accounts with subscription/trial tracking
- `InstagramAccount` - Connected accounts with session data, rate limits, action block status
- `MonitoredReel` - Posts/reels being tracked
- `Keyword` - Triggers for automation
- `DmQueue/DmHistory` - Message queue and history
- `RateLimitConfig` - Per-account DMs/hour and DMs/day limits

### Authentication
- JWT-based with 7-day access tokens, 30-day refresh tokens
- Middleware: `src/middleware/auth.js`
- Password hashing: bcryptjs with 10 salt rounds

### API Routes
- `/api/auth` - Register, login, profile
- `/api/instagram` - OAuth flow, account management
- `/api/automation` - Create/list automations, toggle on/off, view triggers
- `/health` - Health check

## Environment Variables

Required in `.env`:
- `DATABASE_URL` or individual `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- Instagram OAuth credentials for Graph API integration
