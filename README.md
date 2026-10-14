# IMO Recharge

Customer site and admin console for IMO credit recharges, built with Next.js 16
(App Router), Supabase (Postgres) and BaseUPI for UPI payments.

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
| `BASEUPI_SECRET_KEY`        | Server API key from BaseUPI Backend API Keys |
| `BASEUPI_WEBHOOK_SECRET`    | Server webhook signing secret from BaseUPI |
| `CASHFREE_*`                | Retained for status checks and webhooks on legacy orders |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Admin order alerts                   |
| `NEXT_PUBLIC_SITE_URL`      | Canonical URL, used for metadata and payment return URLs |

## BaseUPI activation

1. In [BaseUPI](https://baseupi.app/docs), configure the receiver as
   `kamal6382371168@okicici` and verify that it belongs to your account.
   The merchant phone supplied for setup is `6382371168`; it is not a customer's phone.
2. Generate the backend API key and webhook signing secret. Set
   `BASEUPI_SECRET_KEY` and `BASEUPI_WEBHOOK_SECRET` in `.env.local` for local
   testing and in the production host's environment for the live website.
   Never use `NEXT_PUBLIC_` for these secrets.
3. Register `https://kamalseller.com/api/webhooks/baseupi` in BaseUPI.
4. Install and connect BaseUPI's Android Notification Bridge using its dashboard
   instructions. Enable notification access, exclude it from battery optimization,
   and keep the receiving phone online. Payment confirmation depends on this bridge.
5. Deploy this code with `NEXT_PUBLIC_SITE_URL=https://kamalseller.com` and both secrets.
   Without both secrets, new checkout requests return 503 instead of accepting payments.
6. Make one small payment after deployment. Check that the receiver is correct,
   the checkout amount matches the selected package and quantity, the signed webhook
   marks the order paid, the admin recharge queue shows it, and its Telegram alert arrives.
   Repeat webhook delivery to confirm the order is not notified twice.

The integration pins the official `@snc0x/baseupi` 1.4 API contract: `x-api-key`,
snake-case order fields, line items in paise, and a hosted checkout redirect.
This differs from the examples on the documentation page. Check the installed SDK's
types when upgrading. The webhook accepts both the documented success envelope and
the SDK's `payment.completed` event, verifying HMAC signatures on the raw body and
matching the order's amount and provider. A browser callback cannot mark an order paid.

Customer email is required by the current SDK order API and sent to BaseUPI.
The site verifies payment on returning from hosted checkout; a delayed webhook keeps
the order pending, with its Order ID available for later lookup. Payment confirmation
queues a recharge for the existing admin workflow; it does not directly credit IMO.
Existing Cashfree orders retain their webhook and server status-check flow.
No database migration is required: provider names are already stored as text.

### Admin payment management

- `/admin/payments` shows BaseUPI key readiness without exposing secrets, the
  expected receiver and webhook URL, all-time pending/paid/failed counts, the last
  confirmed payment time, and recent BaseUPI orders. Configuration does not confirm
  that the receiver or Android bridge is set up correctly in the external dashboard.
- Orders can be filtered by provider, payment status, or recharge state and paged
  through 50 records at a time. Recharge-state filters and queue sections include
  only confirmed paid orders, for both BaseUPI and legacy Cashfree payments.
- Order details include provider order/payment references, payment timestamps,
  checkout/payment audit events, notification delivery records, and admin notes.
  Confirmed payment automatically adds the order to the waiting recharge queue;
  admin actions then start, complete, fail, or resume recharge work.
- Dashboard, order lists, payment overview, and recharge queue refresh every 15
  seconds while visible. Failed requests are shown as errors instead of empty results.
  Today's paid count is based on `paid_at` in India time, like today's revenue.
- Webhook replay only acknowledges the already processed payment. It does not
  repeat payment audit entries, Telegram messages, or recharge transitions.

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
