# WishUBest

> Medical marketplace MVP — find a doctor → book → chat (with AI translation) → pay.

**Scope (MVP v2)** — this MVP covers **doctor** providers only. Hospital / hotel / translator,
Affiliate, CMS/Pages, and full Media Library are deferred to a later phase.

## Highlights

- **Doctor discovery** — public SSR marketplace (list/detail, country & city pages, filters).
- **Booking** — `DRAFT → REQUESTED → AWAITING_PAYMENT/CONFIRMED → COMPLETED` with manual doctor
  confirmation; online visits use a manually-entered third-party `meeting_link` (no real video/SDK).
- **Invoice & Payment** — invoices with line items, mock payment gateway + webhook + idempotency,
  append-only financial ledger, platform fee snapshots.
- **Chat + AI translation** — patient↔doctor chat with an **on-demand translate button** per message;
  translations are cached (idempotent per message+locale) and the AI key/prompt is managed by Admin
  (key is encrypted at rest, masked in the UI, server-only calls).
- **Patient medical documents** — private-storage uploads with patient→provider access grants,
  short-lived signed download URLs, strict authorization (a provider can only see relevant patients).

## Tech stack

- **Monorepo**: pnpm workspaces
- **API**: Fastify + TypeScript + Prisma (PostgreSQL)
- **Web**: Next.js (App Router, SSR pages) + Tailwind CSS + a shared `packages/ui` design system
  (minimal "Vercel-like": white/near-black, one accent color, generous whitespace, no heavy shadows)
- **Storage**: pluggable driver — `local` filesystem (default dev) or S3/MinIO
- **Workers**: BullMQ (Redis) optional; MVP translation path is synchronous server-side

## Layout

```
apps/
  api/       Fastify HTTP API + Prisma client wiring
  web/       Next.js app (public pages + patient/provider/admin dashboards)
packages/
  db/        Prisma schema + migrations + seed
  ui/        Shared design system (tokens, Button, Input, CollapsibleSidebar, …)
  config/    Shared tsconfig + Tailwind preset
```

## Local setup

Prerequisites: Node.js ≥ 20, pnpm 9, Docker (for Postgres/Redis/MinIO).

```bash
# 1. Install pnpm
corepack enable && corepack prepare pnpm@9.15.9 --activate

# 2. Start infrastructure (Postgres, Redis, MinIO)
docker compose up -d

# 3. Install dependencies
pnpm install

# 4. Configure environment
cp .env.example .env            # edit JWT_SECRET, and DATABASE_URL if needed
cp apps/api/.env.example apps/api/.env       # API needs env at its own cwd too
cp apps/web/.env.example apps/web/.env       # WEB_URL / API_URL for the Next app

# 5. Create the database schema + seed
pnpm db:setup                   # generate client + migrate + seed (admin, geo, demo data)

# 6. Run
pnpm dev                        # API on :8080, Web on :3000
```

### Required env vars

| Variable              | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `DATABASE_URL`        | PostgreSQL connection string                           |
| `JWT_SECRET`          | Long random secret for auth tokens                     |
| `DB_ENCRYPTION_KEY`   | Secret used to encrypt AI API keys at rest (AES-256-GCM) |
| `TEST_DATABASE_URL`   | PostgreSQL connection string used by the Vitest suite  |
| `API_URL`             | Absolute URL of the API (used by the web app)          |
| `WEB_URL`             | Absolute URL of the web app (CORS / cookies)           |
| `STORAGE_DRIVER`      | `local` (default) or `s3` (MinIO)                      |
| `S3_*`                | Endpoint/keys/bucket when `STORAGE_DRIVER=s3`          |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial Super Admin credentials (seed only) |

### Useful commands

```bash
pnpm dev            # run API + web in parallel
pnpm build          # typecheck + build all packages
pnpm typecheck      # typecheck all packages
pnpm test           # API tests (Vitest, 49 tests), incl. chat-translation & document-access suites
pnpm db:migrate     # apply Prisma migrations
pnpm db:seed        # seed demo data
```

## Security rules (non-negotiable)

- Money is integer minor units (never floats). Ledger is append-only. Payments are idempotent.
- Patient documents live in a **private** bucket; downloads go through short-lived signed URLs with
  server-side authorization. No public URLs ever.
- AI API keys are encrypted at rest, never logged, never sent to the client; AI calls are server-side only.
- Per-milestone commits; real `.env` / secrets are never committed.

## Milestones (git history)

Commits are tagged by milestone: `feat(m0): …` … `feat(m10): …` — see `git log --oneline`.

- M0 Setup · M1 DB & Auth · M2 Admin Core · M3 Doctor Onboarding · M4 Marketplace ·
  M5 Booking & Invoice · M6 Payment & Ledger · M7 Chat + AI Translation · M8 Medical Documents ·
  M9 Reviews + Design System · M10 Hardening.