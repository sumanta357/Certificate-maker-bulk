# AutoCert

**Automated certificate generation, management, verification, and email delivery.**

Upload a CSV → design or select your certificate → generate personalized PDFs → automatically email each participant → verify certificates online.

AutoCert is general-purpose: it works for workshops, conferences, training programs, courses, webinars, competitions, internships, employee and appreciation certificates — any organization, without touching the source code.

---

## Feature overview

| Area | What you get |
| --- | --- |
| **Visual editor** | Canva-style Konva canvas: drag, resize, rotate, layer order, lock/hide, duplicate, copy/paste, undo/redo, alignment, zoom, snap-to-grid, keyboard shortcuts |
| **Elements** | Text, dynamic `{{Variable}}` text, images (logo/seal/signature), shapes (rect/rounded/ellipse/line), QR codes (auto-encoded verification URL) |
| **Templates** | 10 professional starters, duplicate/rename/favorite, full version history with restore — generated certificates keep the version they were made with |
| **CSV import** | Any columns; auto-detection of name/email/institution; manual mapping; validation (empty names, invalid/duplicate emails); duplicate protection (skip / regenerate / replace) |
| **Dynamic variables** | Every CSV column + `{{CERTIFICATE_ID}} {{ISSUE_DATE}} {{EVENT_NAME}} {{EVENT_DATE}} {{ORGANIZATION}} {{ORGANIZER}} {{LOCATION}} {{CERTIFICATE_TYPE}} {{VERIFICATION_URL}}` |
| **Long-name safety** | Auto-fit shrinks text to a min size, then wraps — names never overflow the page |
| **PDF engine** | PDFKit, WYSIWYG with the browser preview (same geometry), print-ready A4/Letter portrait & landscape + custom sizes |
| **Certificate IDs** | `PREFIX-YEAR-000001`, unique per event with customizable prefix |
| **QR verification** | Public page shows VALID / REVOKED with name, organization, event, issue date — never emails; lookups rate-limited and recorded |
| **Email** | Per-recipient personalized attachments; SMTP / Resend / SendGrid / Mailgun / SES via a provider abstraction; test send; batch confirmation dialog; exponential-backoff retries; per-recipient failure isolation |
| **Background jobs** | Generation and sending run server-side — close the browser and processing continues. In-process queue by default; Redis/BullMQ worker for scale |
| **Multi-tenant** | Strict organization isolation enforced in every query; roles: Super Admin / Admin / Editor / Viewer |
| **Security** | bcrypt password hashing, hashed session tokens in HttpOnly cookies, password reset, audit log, input validation (zod), file-type/size validation, path-traversal-safe storage, rate limiting |
| **Dashboard** | Dark/light mode, stats, event workspaces, participant tables (search/filter/paginate), ZIP download, error-report CSV, email delivery log, verification records, audit trail, settings |

## Tech stack

Next.js 14 (Pages Router) · React 18 · TypeScript · Tailwind CSS · Prisma (PostgreSQL / SQLite dev) · PDFKit · Konva/react-konva · PapaParse · BullMQ + Redis (optional) · JSZip · qrcode · nodemailer · next-themes

## Quickstart (development)

```bash
bun install                       # or npm install
npx prisma db push --schema prisma/schema.sqlite.prisma   # dev database (SQLite)
bun run dev                       # http://localhost:3000
```

Open http://localhost:3000, create an account (you become the organization's Super Admin), then:

1. **Create event** — name, date, certificate type, ID prefix
2. **Import CSV** — try `sample-data/participants.csv`
3. **Template** — pick a starter, or design your own in the visual editor
4. **Preview** — render with real participant data (test a very long name)
5. **Generate & Send** — send a test email first, then confirm the batch

With the default `EMAIL_PROVIDER=console`, emails are logged to the server console instead of being sent — perfect for development.

### PostgreSQL instead of SQLite

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/autocert"
npx prisma db push          # uses prisma/schema.prisma automatically
bun run dev
```

## Docker (web + PostgreSQL + Redis + worker)

```bash
docker compose up --build
```

The web container auto-syncs the database schema on boot (`prisma db push`) and
listens on `$PORT` (default 3000). Health probe: `GET /api/health`.

## Deploying to Render

The repo ships a **Render Blueprint** (`render.yaml`) — the fastest path:

1. Push this repository to GitHub/GitLab.
2. In Render: **New → Blueprint** and pick the repo. Render reads `render.yaml`
   and provisions **autocert-web** (Docker) + **autocert-db** (PostgreSQL).
3. Fill in the two prompt values when asked:
   - `EMAIL_PROVIDER` — `resend` (recommended), `smtp`, `sendgrid`, `mailgun`, `ses`, or `console` (log-only)
   - `EMAIL_FROM` — your verified sender, e.g. `certificates@yourdomain.com`
4. Add provider credentials in the dashboard after the first deploy
   (e.g. `RESEND_API_KEY`). `AUTH_SECRET` is generated for you; `APP_URL`
   defaults to your Render URL automatically.
5. First deploy runs `prisma db push` on boot, then starts on `$PORT` with
   `/api/health` as the health check.

CLI alternative: `render blueprint launch`

**Scaling options (uncomment in `render.yaml`):** managed Redis + a BullMQ
worker service, then set `QUEUE_MODE=redis` and `REDIS_URL` on the web service.
For storage at scale, set `STORAGE_DRIVER=s3|r2|supabase` plus the S3-compatible
credentials so PDFs live outside the container.

## Configuration

See `.env.example` for the full list. Nothing is hard-coded.

### Queue

- `QUEUE_MODE=inprocess` (default) — jobs run in the web server; zero config
- `QUEUE_MODE=redis` — requires `REDIS_URL`; run the worker with `bun run worker` (docker-compose includes it)

### Storage

- `STORAGE_DRIVER=local` (default) — files under `./storage`, private
- `STORAGE_DRIVER=s3|r2|supabase` — set `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` (R2/Supabase are S3-compatible)

### Email

`EMAIL_PROVIDER` = `console` | `smtp` | `resend` | `sendgrid` | `mailgun` | `ses`, plus the matching credentials from `.env.example`. Sender identity comes from `EMAIL_FROM` / `EMAIL_FROM_NAME`. **AutoCert never sends with built-in credentials and does not claim unlimited free email** — bring your own provider account.

### Core

- `DATABASE_URL` — PostgreSQL (prod) or `file:./dev.db` (dev)
- `AUTH_SECRET` — long random string
- `APP_URL` — public base URL used in QR codes and verification links

## API overview

```
POST /api/auth/register | login | logout          GET /api/auth/me
POST /api/auth/password?action=forgot|reset
GET/POST /api/events                              GET/PATCH/DELETE /api/events/:id
POST /api/events/:id/upload                       GET /api/events/:id/participants
POST /api/events/:id/generate                     POST /api/events/:id/send
GET  /api/events/:id/preview                      GET /api/events/:id/download?mode=zip|errors
GET/PUT /api/events/:id/email-template
GET/POST /api/templates                           GET/PATCH/DELETE /api/templates/:id
GET/POST /api/certificates/:id                    (action: resend|regenerate|revoke|unrevoke)
GET /api/certificates/:id/pdf
GET /api/verify/:certificateId                    (public, rate-limited)
GET /api/qr?url=                                  GET /api/stats   GET /api/audit
```

All endpoints enforce authentication and organization-scoped authorization; secrets are read from environment variables only and never exposed to the frontend.

## Deployment

**Render (recommended):** use the Blueprint above. Any other Node host
(Railway, Fly.io, VPS, Docker) works too:

1. Provision PostgreSQL (+ Redis if you want the separate worker)
2. Set the environment variables from `.env.example`
3. Deploy the Docker image (or `bun install && npx prisma db push && bun run build`)
4. Start with `bun run start` (web) and, in Redis mode, `bun run worker`
5. Point a health check at `/api/health` if your host supports it

## Project layout

```
src/lib/          core services (auth, csv, storage, email, pdf, queue, variables, design, jobs)
src/pages/api/    REST API routes (incl. /api/health probe)
src/pages/        landing, auth, dashboard, events, templates, certificates, emails, verify
src/components/   dashboard shell, Konva canvas, visual editor
prisma/           schema (PostgreSQL) + SQLite variant for dev
scripts/          worker entry, prisma schema bootstrap
docker-entrypoint.sh  container roles: web | worker | push
render.yaml       Render Blueprint (web + PostgreSQL, optional Redis/worker)
Dockerfile        multi-stage production image (non-root, PORT-aware)
sample-data/      demo CSV
```

## License

See `LICENSE`.
