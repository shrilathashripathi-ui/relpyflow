# ReplyFlow

Self-hostable Instagram DM automation — monitor posts and reels for keyword comments, then automatically send DMs to those users. Run it free on your own machine or server instead of paying for ManyChat.

## What it does

- Watches any Instagram post or reel for comments containing keywords you choose
- Automatically sends a DM to each matching commenter
- Respects Instagram rate limits per account
- Tracks DM history and daily analytics
- Works with the official Instagram Graph API (requires a Meta Developer app)

---

## Quick start (self-host on your laptop)

### Prerequisites

| Tool | Why |
|------|-----|
| [Node.js 18+](https://nodejs.org) | Runs the server |
| [PostgreSQL 14+](https://www.postgresql.org/download/) | Stores automations, queues, history |
| A [Meta Developer app](https://developers.facebook.com) | Instagram OAuth + webhook access |

### 1 — Clone and install

```bash
git clone https://github.com/shrilathashripathi-ui/relpyflow.git
cd relpyflow
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the **REQUIRED** section:

| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Your local Postgres connection string |
| `JWT_SECRET` | Any long random string (e.g. `openssl rand -hex 32`) |
| `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` | Meta app dashboard → Instagram product |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Meta app dashboard → App settings |

Everything under **OPTIONAL** (email, payments, AI replies) can be left blank — the app boots and runs without them.

`ENCRYPTION_KEY` can also be left blank — the app auto-generates one and saves it to `.env` on first run.

### 3 — Set up the database

```bash
npx prisma migrate deploy
```

### 4 — Start

```bash
npm run dev        # development (auto-reload)
npm start          # production
```

The API runs on `http://localhost:5000`.

---

## Frontend

The frontend lives in `frontend/` and is a separate Vite/React app.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

---

## Meta / Instagram setup

To connect an Instagram account you need a Meta Developer app with:

- **instagram_business_basic**
- **instagram_business_manage_messages**
- **instagram_business_manage_comments**

For local development, use [ngrok](https://ngrok.com) to expose `localhost:5000` so Meta can reach your webhook:

```bash
ngrok http 5000
```

Set the webhook URL in Meta dashboard to `https://<your-ngrok-url>/api/meta/webhook` and the verify token to whatever you put in `WEBHOOK_VERIFY_TOKEN`.

---

## Architecture

```
Routes → Middleware (auth, validation) → Controllers → Services → Prisma/DB
```

**Background workers** (auto-start when `AUTO_START_WORKERS=true`):

| Worker | Job |
|---|---|
| CommentPoller | Polls Instagram every 30 s for new comments |
| KeywordMatcher | Checks comments against your keyword list |
| DMQueueWorker | Sends queued DMs, respects rate limits |
| FollowUpWorker | Sends optional follow-up DMs |

See [CLAUDE.md](CLAUDE.md) for deeper architecture notes.

---

## Project structure

```
src/
  config/        Database connection, env helpers
  controllers/   Route handlers
  middleware/    Auth (JWT), validation, rate limiting
  routes/        Express routers
  services/
    instagram/   Instagram API wrappers, poller, keyword matcher
    emailService.js
    razorpayService.js
  utils/         JWT, encryption, logger
prisma/
  schema.prisma  Data model
  migrations/    All DB migrations
frontend/        React/Vite frontend
```

---

## Environment variables

See [`.env.example`](.env.example) for a full annotated list of every variable, split into REQUIRED and OPTIONAL.

---

## License

MIT — see [LICENSE](LICENSE).
