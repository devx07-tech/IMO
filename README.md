# IMO Recharge

Customer site and admin console for IMO credit recharges, built with Next.js 16
(App Router), Supabase (Postgres) and Razorpay for payments.

- **Customer site** (`/`): enter IMO ID and WhatsApp number, pick a package, pay through
  Razorpay, and look up purchase history by IMO ID, mobile number or Order ID.
- **Admin console** (`/admin`): orders, recharge queue, payments, packages, notifications,
  audit log, and a WhatsApp button to message each customer.
- **Notifications**: Telegram message to the admin on every paid order (IMO ID, diamonds,
  amount, customer WhatsApp) and every completed recharge.

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
| `RAZORPAY_KEY_ID`           | Razorpay key id (`rzp_test_…` or `rzp_live_…`); public |
| `RAZORPAY_KEY_SECRET`       | Server-only Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET`   | Secret you choose when creating the Razorpay webhook |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Admin order alerts                   |
| `NEXT_PUBLIC_SITE_URL`      | Canonical URL, used for metadata and links in alerts |

## Payments (Razorpay)

1. **Checkout.** `POST /api/orders` saves the order (exact package price, customer's
   WhatsApp number) and creates a Razorpay order. The browser opens Razorpay Checkout,
   which on phones offers Google Pay / PhonePe / Paytm and other UPI apps directly, plus
   cards and net banking. Orders above ₹1,00,000 are refused.
2. **Confirmation.** On success Checkout returns a signed response to `/api/orders/pay`.
   The signature is checked, then the payment is fetched from Razorpay, so status and
   amount always come from Razorpay, never the browser. The webhook
   (`/api/webhooks/razorpay`, `payment.captured` / `order.paid`, HMAC-verified) confirms the
   same payment even if the customer closes the page. If neither has arrived, the checkout
   screen asks Razorpay directly (`/api/orders/verify?sync=1`). Confirmation is idempotent:
   the order is marked paid once, one payment can't pay two orders, and an authorized
   payment is captured first.
3. **After payment.** The order enters the recharge queue and Telegram gets the alert. The
   admin credits the diamonds in IMO, marks the order completed, and taps **WhatsApp** to
   send the customer a ready-made message with a link to their purchase history
   (`/?history=<IMO ID>`).
4. **History.** Customers search by IMO ID, WhatsApp number or Order ID and see their paid
   orders, amounts and whether the diamonds were credited.
5. **In-app browsers.** Opened inside IMO, WhatsApp, Instagram or Facebook on Android, the
   site moves itself to Chrome (once per session) because in-app browsers can't always
   open UPI apps; a banner offers the same. iOS shows instructions to open in Safari.

### Razorpay setup

1. Razorpay Dashboard → **Account & Settings → API Keys**: generate keys. Use **Test mode**
   first, then **Live mode**.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Vercel (and `.env.local` for local
   testing). Never put the key secret in client code or chat.
3. Razorpay Dashboard → **Webhooks → Add new webhook**:
   - URL: `https://kamalseller.com/api/webhooks/razorpay`
   - Secret: a long random string; set the same value as `RAZORPAY_WEBHOOK_SECRET`
     (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`)
   - Events: `payment.captured` and `order.paid`
4. Keep **automatic capture** on (Settings → Payment Capture). If it is off, the site
   captures authorized payments itself.
5. Add kamalseller.com under Razorpay's website / app details so live payments are allowed
   from this domain. Each other website using the same Razorpay account must be added too;
   their webhooks for unknown orders are acknowledged and ignored here.
6. Redeploy, open **Admin → Payments** and check that keys, mode and webhook show as
   configured. Make a test-mode payment, then a small live one.

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
