# IMO Recharge

Customer site and admin console for IMO credit recharges, built with Next.js 16
(App Router), Supabase (Postgres) and Cashfree for UPI payments.

- **Customer site** (`/`): enter IMO ID, pick a package, pay, and look up order status.
- **Admin console** (`/admin`): orders, recharge queue, packages, notifications, audit log.
- **Notifications**: Telegram message to the admin on every paid / completed order.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Create an admin account:

```bash
node scripts/seed-admin.mjs you@example.com 'a-long-password' "Your Name"
```

## Scripts

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Dev server on :3000             |
| `npm run build`     | Production build                |
| `npm run lint`      | ESLint                          |
| `npm run typecheck` | TypeScript, no emit             |
| `npm test`          | Unit tests (Vitest)             |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, a production
dependency audit and a build on every push and pull request.

## Environment variables

See `.env.example`. All secrets are server-only; only `NEXT_PUBLIC_*` values
reach the browser.

| Variable                    | Notes                                              |
| --------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase project URL                               |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Never expose to the client.           |
| `ADMIN_SESSION_SECRET`      | ≥ 32 random chars. Rotating it signs all admins out |
| `CASHFREE_*`                | Payment gateway credentials and `sandbox`/`production` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Admin order alerts                   |
| `NEXT_PUBLIC_SITE_URL`      | Canonical URL, used for metadata and payment return URLs |

## Database

Migrations live in `supabase/migrations/` and are applied to the Supabase
project in order. Row Level Security is enabled on every table with **no**
policies, so the public anon key can read nothing; all access goes through
server code using the service-role key.

## Security model

- **Admin auth**: bcrypt passwords, HS256 JWT in an `httpOnly`, `secure`,
  `SameSite=Lax` cookie (24 h). Checked in `src/proxy.ts` *and* again in every
  admin route handler (`requireAdmin`), which also enforces server-side
  revocation via `admins.sessions_valid_after`. Logging out revokes every
  session for that admin. To force-sign-out an admin, set
  `sessions_valid_after = now()` on their row.
- **Brute force**: per-IP and per-email login limits; constant-time response
  for unknown emails.
- **Rate limiting**: shared across all server instances via the
  `rate_limit_hit` Postgres function, with an in-memory fallback if the
  database is unreachable.
- **CSRF**: cross-origin `POST`/`PATCH`/`DELETE` to `/api/admin/*` is rejected.
- **Headers**: CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, COOP (see `next.config.ts`).
- **Order lookup**: exact match on a validated order number; order numbers
  are 10 random base32 characters, so they can't be guessed.

## Operations

- **Health check**: `GET /api/health` returns `200 {"status":"ok"}` or `503`;
  point an uptime monitor at it.
- **Errors**: unhandled server errors are logged as one JSON line with
  `"event":"server_error"` (`src/instrumentation.ts`); filter on that in the
  Vercel logs or wire it to an error tracker.
- **Package changes** in the admin console update the public price list
  immediately; otherwise the homepage refreshes at most once a minute.
- **Help video**: `public/help/imo-id-guide.mp4`, opened from the "?" next
  to the "IMO ID / Mobile Number" label. Replace the file to update it.
