# IMO Recharge

Customer site and admin console for IMO credit recharges, built with Next.js 16
(App Router) and Supabase (Postgres). Customers pay by UPI through the dghost UPI gateway
(pay.dghost.in, default), directly to Kamal's own UPI IDs, or through Razorpay.

- **Customer site** (`/`): enter IMO ID, pick a package, pay, and look up purchase history
  by IMO ID, mobile number or Order ID.
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
| `PAYMENT_MODE`              | `dghost` (default), `upi` or `razorpay` |
| `DGHOST_USER_TOKEN`         | Server-only dghost API token (gateway dashboard → Developers) |
| `UPI_BRIDGE_SECRET`         | ≥ 32 random chars. The payment phone sends it to confirm UPI payments |
| `RAZORPAY_KEY_ID`           | Razorpay key id (`rzp_test_…` or `rzp_live_…`); public |
| `RAZORPAY_KEY_SECRET`       | Server-only Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET`   | Secret you choose when creating the Razorpay webhook |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Admin order alerts                   |
| `NEXT_PUBLIC_SITE_URL`      | Canonical URL, used for metadata and links in alerts |

## Payments

`PAYMENT_MODE` picks the checkout for new orders: `dghost` (default), `upi` or `razorpay`.
Orders already open keep the checkout they were created with.

### UPI gateway (default, pay.dghost.in)

1. **Checkout.** `POST /api/orders` saves the order (exact package price) and creates a
   gateway order with the same Order ID, a 30-minute payment window and
   `redirect_url = https://kamalseller.com/?order=<Order ID>`. The browser goes to the
   gateway's payment page; its link is kept in `provider_order_id` so "Pay now" reopens it.
   The gateway requires a mobile number: the customer's WhatsApp number if given, otherwise
   `BUSINESS.phone`.
2. **Confirmation.** Only the gateway's `check-order-status` API is trusted: `SUCCESS` for
   this Order ID and the exact amount. It is asked when the customer comes back
   (`/api/orders/verify?sync=1`) and whenever the webhook (`/api/webhooks/dghost`) arrives;
   the webhook isn't signed, so its body is only a trigger. The UTR is stored as the payment
   id, so one UTR can pay only one order. A reported failure closes the order; a later
   success still confirms it.

Setup:

1. Gateway dashboard → **Developers**: copy the API token into `DGHOST_USER_TOKEN` in Vercel
   (and `.env.local`). Don't commit it.
2. Set **Webhook URL** to `https://kamalseller.com/api/webhooks/dghost`.
3. Redeploy, check **Admin → Payments**, then pay a small live order and check it turns Paid
   with a Telegram alert.

### Direct UPI (when `PAYMENT_MODE=upi`)

Money goes straight to Kamal's own UPI IDs, configured in `src/lib/business.ts`
(`BUSINESS.upi`):

| Checkout option | Pays to | Why |
| --- | --- | --- |
| Paytm button | merchant `paytm.s2sovgg@pty` | Paytm accepts app-opened payments to its own merchant ID |
| Google Pay / PhonePe / Other UPI apps | personal `kamal6382371168@okicici` | the merchant ID rejects these ("VPA not available") |
| QR code (computer, or saved to the gallery) | merchant | scanned payments are accepted |

Change `BUSINESS.upi.routes` if testing shows otherwise.

1. **Checkout.** Each order gets a unique amount: package total minus 1–99 paise (₹30 →
   e.g. ₹29.37). A partial unique index stops two open orders sharing an amount, so the
   amount identifies the order whichever ID it was paid to. Unpaid orders close after 30
   minutes. Orders above ₹1,00,000 are refused.
2. **Automatic confirmation.** Kamal's phone forwards the Paytm for Business "payment
   received" notification (merchant ID) and the ICICI credit SMS (personal ID) to
   `/api/payments/upi-notify`. The server reads the amount and UTR, marks the matching order
   paid, sends the Telegram alert and puts it in the recharge queue; the customer's screen
   updates by itself.
3. **Fallback.** The customer can enter their 12-digit UTR. If the phone already reported it
   with the right amount the order is confirmed; otherwise it goes to **Admin → Payments →
   Needs review** with a Telegram alert. A customer's UTR alone never confirms a payment.
   Late or wrong-amount payments appear under **Unmatched payments** to attach or dismiss.
   Customers can cancel an unpaid order (not once they've submitted a UTR).

The bridge endpoint needs `Authorization: Bearer <UPI_BRIDGE_SECRET>` (constant-time
compare, refused if the secret is under 32 characters) and is rate limited; one UTR can
confirm only one order; confirmation is a conditional update so it can't happen twice.

### Payment phone (automatic UPI confirmation)

Use Kamal's phone (it receives the ICICI SMS) or a phone with the same SIM, kept on.

1. Set `UPI_BRIDGE_SECRET` in Vercel (generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
2. Install **Paytm for Business**, sign in, and turn on payment notifications.
3. Install **MacroDroid** and create three macros, each with the action *HTTP Request* →
   `POST https://kamalseller.com/api/payments/upi-notify`, header
   `Authorization` = `Bearer <UPI_BRIDGE_SECRET>`, content type `text/plain`:
   - Trigger *Notification Received* → app **Paytm for Business**; body `[not_title] - [notification]`
   - Trigger *SMS Received* → from senders containing **ICICI** and text containing
     **credited**; body `[sms_message]`
   - Trigger *Regular Interval* every 15 minutes; body `ping` (shows the phone is online)
4. Give MacroDroid notification and SMS access; turn off battery optimisation for MacroDroid
   and Paytm for Business.
5. Pay a small live order through each button (Paytm, Google Pay, PhonePe, QR) from another
   person's account and check each turns Paid with a Telegram alert.

### Razorpay (when `PAYMENT_MODE=razorpay`)

1. **Checkout.** `POST /api/orders` saves the order (exact package price) and creates a
   Razorpay order; the browser opens Razorpay Checkout (one-tap UPI apps, cards, net
   banking).
2. **Confirmation.** The signed checkout response goes to `/api/orders/pay`, which re-fetches
   the payment from Razorpay; the HMAC-verified webhook (`/api/webhooks/razorpay`,
   `payment.captured` / `order.paid`) confirms it even if the customer closes the page; the
   checkout screen can also ask Razorpay directly (`/api/orders/verify?sync=1`). Confirmation
   is idempotent and one payment can't pay two orders.

### After payment (all modes)

The order enters the recharge queue and Telegram gets the alert (IMO ID, diamonds, amount,
customer WhatsApp). The admin credits the diamonds in IMO, marks the order completed and taps
**WhatsApp** to send the customer a ready-made message with a link to their purchase history
(`/?history=<IMO ID>`). Opened inside IMO, WhatsApp, Instagram or Facebook on Android, the
site attempts to open Chrome so UPI apps can open; iOS attempts to open Safari.
The host app may block either request, so the site also provides an explicit browser
button, menu instructions, and a copyable link.

### Sharing a browser-opening link in IMO

After deploying, share **https://kamalseller.com/open**. This lightweight page tries
to open the recharge homepage in Chrome on Android or Safari on iPhone, even when
the host app hides its identity. It preserves query parameters and the URL fragment
(for example `/open?history=123456789#transaction-history`). It does not need the
database to show instructions. Desktop visitors continue to the recharge homepage.

If IMO blocks the launch, the visitor can tap **Open in Chrome / Safari**, use IMO's
**Open in browser** menu option, or copy the website link. The fallback URL prevents
automatic redirect loops; other buttons and form taps never trigger a browser launch.
An HTTPS link cannot force IMO to launch another app, and this cannot help if IMO
refuses to load any HTML from the site. Test the shared link on real Android and
iPhone devices inside IMO before sending it to customers.

### Razorpay setup

1. Razorpay Dashboard → **Account & Settings → API Keys**: generate keys. Use **Test mode**
   first, then **Live mode**.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `PAYMENT_MODE=razorpay` in Vercel (and
   `.env.local` for local testing). The keys must belong to Kamal's own Razorpay account.
   Never put the key secret in client code or chat.
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
