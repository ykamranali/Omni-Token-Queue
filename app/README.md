# Omni Token Queue

A self-contained queue and token management system: admin dashboard, kiosk ticketing, agent terminal, and a live TV display, running from one Node.js process against a local SQLite database.

**Zero npm dependencies.** The backend uses only Node's built-in modules (`node:http`, `node:sqlite`, `node:crypto`), so there is nothing to `npm install` and no internet access is required at deploy time — a real advantage for on-premise installs at banks, government offices, or hospitals with locked-down or air-gapped networks.

## What's included

- **Admin dashboard** (`/admin`) — branches, departments, counters, services, queue rules, users & roles, daily reports.
- **Kiosk** (`/kiosk`) — public, no login. Customer picks a service and gets a token with queue position and estimated wait.
- **Agent terminal** (`/agent`) — staff login, call next / recall / start serving / complete / no-show per counter.
- **TV display** (`/display`) — public, no login. Live "now serving" board per counter, waiting counts per service, scrolling messages, and spoken announcements via the browser's built-in text-to-speech (click anywhere on the display once to enable audio — browsers require a user gesture before they'll speak).
- Live updates via Server-Sent Events (no WebSocket library needed).
- Role-based permissions (`services.manage`, `queue.manage`, `admin.manage`, `reports.view`), session-cookie auth, scrypt password hashing.
- A database schema (`db/schema.sql`) that also matches the multi-tenant PostgreSQL design shared earlier — form builder, workflow builder, display content, notification templates, and more are modeled in the schema so the system can grow into those features without a redesign.

## Requirements

- **Node.js 22.5 or newer** (Node 22 LTS recommended). That's it — no database server, no npm install, no build step.
- Check with: `node --version`

## Quick start

```bash
cp .env.example .env
# edit .env - at minimum set SESSION_SECRET and the seed admin password
npm start
```

The first run creates `data/omni_token_queue.sqlite`, applies the schema, and seeds one company, one branch ("Main Branch"), two demo services, and an admin account:

- Admin dashboard: http://localhost:3000/admin
- Kiosk: http://localhost:3000/kiosk
- Agent terminal: http://localhost:3000/agent
- TV display: http://localhost:3000/display

Default login is printed to the console on first run (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`, defaults to `admin@example.com` / `ChangeMe123!`). **Change this password immediately in a real deployment.**

Seeding only ever runs once, against an empty database — restarting the server never touches existing data.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `DB_PATH` | Path to the SQLite file (default `./data/omni_token_queue.sqlite`) |
| `SESSION_SECRET` | Signs session cookies — set a long random string in production |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Only used the first time the database is created |
| `SEED_COMPANY_NAME` | Name shown on the kiosk and display |

## Deploying on-premise

### Option A — plain Node.js + systemd (bare metal / VM)

```bash
git clone <this repo> /opt/omni-token-queue   # or copy the folder over
cd /opt/omni-token-queue
cp .env.example .env && nano .env
sudo cp deploy/omni-token-queue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now omni-token-queue
```

Put nginx or another reverse proxy in front for HTTPS — see `deploy/nginx.conf.example` (it also has the settings needed to keep the live-display SSE connection from being buffered by the proxy).

### Option B — Docker

```bash
docker compose up -d --build
```

This builds the image (no network access needed beyond pulling the base `node:22-slim` image once) and persists the database in a named volume (`otq-data`) so it survives container recreation/upgrades.

### Backups

The entire application state is one file: the SQLite database at `DB_PATH`. Back it up with a simple file copy (stop the service first, or use `sqlite3 <path> ".backup backup.sqlite"` for a safe online backup) — no separate database server to manage.

## Project structure

```
server.js              entry point - HTTP server, routing, static file serving
src/
  db.js                 opens the SQLite file, applies schema.sql + seed.js on first run
  seed.js                creates the starter company/branch/services/admin user
  auth.js                password hashing (scrypt) + signed session cookies
  sse.js                 Server-Sent Events broadcast hub (per-branch)
  router.js               tiny dependency-free HTTP router
  middleware.js            requireAuth / requirePermission guards
  routes/                 one file per resource (tokens, services, branches, ...)
db/
  schema.sql              full database schema (44 tables)
public/
  login.html, admin.html, kiosk.html, agent.html, display.html
  css/style.css, js/common.js
deploy/
  omni-token-queue.service   systemd unit example
  nginx.conf.example          reverse proxy example (HTTPS + SSE-safe)
```

## API overview

All endpoints are under `/api`. Reads needed by the public kiosk/display (`/api/meta`, `/api/services`, `/api/tokens` (list), `/api/display/:branchId/*`) require no login. Everything that changes queue state or configuration requires a session cookie (`POST /api/auth/login`) and, for configuration endpoints, the `admin.manage` or `services.manage` permission; for queue actions, `queue.manage`.

Core queue lifecycle: `POST /api/tokens` (kiosk issues a token) → `POST /api/counters/:id/call-next` (agent) → `POST /api/tokens/:id/serve` → `POST /api/tokens/:id/complete` (or `/no-show`, `/cancel`, `/recall`, `/transfer`). Every transition is recorded in `token_events` for a full audit trail, and broadcast over SSE to `/api/display/:branchId/stream` so the TV display and any open agent terminals update immediately.

## Known limitations / what would need more work

This is a working core system, not the full RSI-style product spec end to end. Specifically **not** wired into a working UI yet (though the schema already supports them):

- Drag-and-drop customer intake **form builder** UI (the schema and EAV storage for dynamic fields exist; there's no admin screen to design forms yet — the seeded "Customer Registration" form is created directly in the database).
- Visual **workflow builder** for multi-step services (Reception → Document Check → Payment → Issuance) — the schema supports it; the agent terminal currently treats every service as a single queue → counter step.
- Real **SMS/WhatsApp/email delivery** — `document_templates` and `notification_logs` tables exist for this, but no provider (Twilio, SendGrid, etc.) is wired up. That needs the client's own account/API keys.
- Multi-company switching in the admin UI (the schema is multi-tenant; this build assumes one company per deployment, which matches a typical on-premise install).

None of these require a redesign — they're additive on top of the current schema and API structure.
