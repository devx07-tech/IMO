# IMO Recharge

Customer site and admin console for IMO credit recharges, built with Next.js 16
(App Router) and Supabase (Postgres). Customers pay by UPI directly to our Paytm
for Business merchant UPI ID; no payment gateway is involved.

- **Customer site** (`/`): enter IMO ID, pick a package, pay, and look up order status.
- **Admin console** (`/admin`): orders, recharge queue, packages, notifications, audit log.
- **Notifications**: Telegram message to the admin on every paid / completed order, every
  UTR that needs review, and every payment that matched no order.

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
| `UPI_BRIDGE_SECRET`         | ≥ 32 random chars. The payment phone sends it to confirm payments |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Admin order alerts                   |
| `NEXT_PUBLIC_SITE_URL`      | Canonical URL, used for metadata and links in alerts |

## Payments (direct UPI)

Every order is paid to the merchant UPI ID in `src/lib/business.ts`
(`paytm.s2sovgg@pty`, payee name `Kamal Srinivasan`).

1. **Checkout.** The order gets a unique amount: the package total minus 1–99 paise
   (₹30 becomes e.g. ₹29.37). A partial unique index stops two open orders sharing an
   amount, so the amount alone tells us which order a payment belongs to. Orders above
   ₹1,00,000 are refused (the usual UPI per-payment limit).
2. **Pay.** On Android the customer taps "Pay with UPI app" (system app chooser) or a
   Google Pay / PhonePe / Paytm button; on iPhone, the app buttons; on a computer, a QR
   code. Every option fills in the payee, exact amount and Order ID.
3. **Automatic confirmation.** A phone signed in to Paytm for Business forwards each
   "payment received" notification to `/api/payments/upi-notify`. The server reads the
   amount (and UTR when present), marks the matching order paid, adds it to the recharge
   queue and sends the Telegram alert. The customer's screen updates by itself.
4. **Fallback.** If nothing arrives, the customer can enter their 12-digit UTR. If the
   phone already reported that UTR with the right amount, the order is confirmed at once.
   Otherwise it goes to **Admin → Payments → Needs review** and you get a Telegram
   alert. A UTR typed by a customer never confirms a payment on its own.
5. **Expiry.** Unpaid orders close after 30 minutes and their amount is freed. A payment
   that arrives late, or with the wrong amount, shows up under **Unmatched payments**
   (with a Telegram alert) where you can attach it to the right order or dismiss it.

Security: the bridge endpoint needs `Authorization: Bearer <UPI_BRIDGE_SECRET>`
(compared in constant time, refused if the secret is shorter than 32 characters) and is
rate limited. A UTR can confirm only one order (unique index), payments are confirmed with
a conditional update so they can't be confirmed twice, the UTR endpoint is rate limited,
and admins must confirm the exact amount before approving.

### Payment phone (automatic confirmation)

Use an Android phone that stays on, ideally a spare one.

1. Generate a secret and set it as `UPI_BRIDGE_SECRET` on the host (and in `.env.local`):
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. Install **Paytm for Business**, sign in to the merchant account, and turn on payment
   notifications.
3. Install **MacroDroid** and create a macro:
   - Trigger: *Notification* → *Notification Received* → app **Paytm for Business**.
   - Action: *HTTP Request* → `POST https://kamalseller.com/api/payments/upi-notify`
     - Header: `Authorization` = `Bearer <your UPI_BRIDGE_SECRET>`
     - Content type `text/plain`, body: `[not_title] - [notification]`
4. Create a second macro so the admin page can tell the phone is online:
   - Trigger: *Regular Interval* every 15 minutes.
   - Action: the same HTTP Request with body `ping`.
5. In Android settings, give MacroDroid notification access, and turn off battery
   optimisation for MacroDroid and Paytm for Business.
6. Pay ₹1–2 to a live order from another phone. Check that the order turns Paid on the
   site, appears in the recharge queue, and that the Telegram alert arrives.
   **Admin → Payments** shows when the phone last checked in.

If the phone is off, customers can still pay; their orders wait for UTR review instead
of being confirmed automatically.

### Admin payment management

- `/admin/payments`: phone status, waiting/review/unmatched/paid counts, the **Needs
  review** queue (Approve after you see the exact amount and UTR in Paytm for Business,
  or Reject), **Unmatched payments** (attach to an order or dismiss), recent UPI orders.
- Order details show confirmed and customer UTRs, the payment window, and Approve /
  Reject buttons for orders still waiting for payment.
- Orders can be searched by Order ID, Profile ID or 12-digit UTR. Recharge-state
  filters and queue sections include only confirmed paid orders.
- Dashboard, order lists, payment overview and recharge queue refresh every 15 seconds
  while visible.

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
