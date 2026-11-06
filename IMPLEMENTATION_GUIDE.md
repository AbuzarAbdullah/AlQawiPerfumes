# Alqawiperfumes — Implementation Guide

A production-oriented e-commerce stack on Cloudflare Pages + D1. India-only, INR, two payment methods (manual UPI + Razorpay), simplified 5-stage customer tracking, server-authoritative pricing and inventory, cookie-session admin.

Everything here reflects what is *actually* in the repo. If a section says a file exists, it does. If something is called a "shortcut" it is explicitly deferred — see **Deferred items** at the end.

---

## 1. Architecture at a glance

```
Browser  ──────────  Cloudflare Pages (static)
   │                      │
   │                      ▼
   │              Cloudflare Pages Functions   ──►  Razorpay (sandbox or live)
   │                      │                      ─►  Resend (email)
   │                      ▼                      ─►  WhatsApp Cloud API
   └──────────────  Cloudflare D1 (SQLite)
```

- **Static frontend** (`index.html`, `app.js`, `checkout.html`, `checkout.js`, `track.html`, `track.js`, `admin.html`, `admin.js`, `styles.css`, `brand.css`, `shop.css`, `catalog.js`).
- **API** as Pages Functions under `functions/api/**`. Each file is a route; folder `_shared/` holds cross-cutting helpers; `functions/api/admin/_middleware.js` gates all admin endpoints.
- **Database** is a single D1 instance, bound as `DB`. Schema is additive-migration-based.

No build step, no bundler. The site deploys as-is.

---

## 2. Repository map

```
.
├─ index.html / app.js / catalog.js      Storefront (collections, filter, cart, detail dialog)
├─ checkout.html / checkout.js           Cart review + delivery form + UPI + idempotency
├─ track.html / track.js                 Token-based tracking + Razorpay checkout + UTR form
├─ admin.html / admin.js                 Login panel + orders / inventory / products tabs
├─ styles.css / brand.css / shop.css     Theme (black / champagne / gold)
├─ _headers                              Security headers (CSP, frame, referrer…)
├─ schema.sql                            v1 initial schema (products, orders, order_items)
├─ seed.sql                              v1 seed (28 standard products with NULL prices)
├─ migrations/
│   ├─ 001_v2_core.sql                   collections, premium catalogue, prices,
│   │                                    inventory, payments, webhooks, status history,
│   │                                    admin_users, refunds, coupons, notifications
│   ├─ 002_order_tokens.sql              idempotency_key, order_counters
│   └─ 003_customer_contact.sql          email, delivery_instructions
├─ functions/
│   ├─ _shared/
│   │   ├─ config.js                     Enums, SHIPPING_FEE_INR, UPI identity,
│   │   │                                INTERNAL_TO_CUSTOMER mapping, flags
│   │   ├─ response.js                   json(), badRequest()
│   │   ├─ validate.js                   isNonEmptyString, isIndianPhone,
│   │   │                                isIndianPincode, isEmail, verifyTurnstile
│   │   ├─ tokens.js                     newTrackingToken, hashToken, orderNumber
│   │   ├─ auth.js                       PBKDF2 hash/verify + HMAC session cookie
│   │   ├─ razorpay.js                   createGatewayOrder, verifyPaymentSignature,
│   │   │                                verifyWebhookSignature
│   │   └─ notify.js                     notifyOrder(env, orderId, template)
│   └─ api/
│       ├─ products.js                   GET /api/products[?collection=std|prm]
│       ├─ orders.js                     POST /api/orders   (hardened checkout)
│       ├─ orders/
│       │   ├─ [id]/utr.js               Legacy UTR submit (kept for pre-v2 orders)
│       │   └─ track/
│       │       ├─ [token].js            GET /api/orders/track/:token  (public, no PII)
│       │       └─ [token]/utr.js        POST .../utr  (token-authed UTR submit)
│       ├─ track/[id].js                 Legacy order-id tracker
│       ├─ payments/gateway/
│       │   ├─ create.js                 POST .../gateway/create
│       │   ├─ verify.js                 POST .../gateway/verify
│       │   └─ webhook.js                POST .../gateway/webhook
│       └─ admin/
│           ├─ _middleware.js            Session cookie gate (whitelist: login/logout/setup)
│           ├─ setup.js                  POST /api/admin/setup  (one-shot bootstrap)
│           ├─ login.js / logout.js
│           ├─ orders.js                 GET /api/admin/orders
│           ├─ orders/[id].js            GET + PATCH (internalStatus → stage, history, notify)
│           ├─ orders/[id]/verify-payment.js
│           ├─ orders/[id]/reject-payment.js
│           ├─ orders/[id]/cancel.js     Releases inventory reservation, notifies
│           ├─ products.js / products/[id].js
│           ├─ variants/[id].js
│           ├─ inventory.js / inventory/[variantId].js
│           ├─ refunds.js                POST /api/admin/refunds (Razorpay or manual)
│           └─ reports/sales.js          GET /api/admin/reports/sales  (dashboard numbers)
└─ wrangler.toml                         Pages project + D1 binding
```

---

## 3. Data model (effective, after all migrations)

- **products** — `id, name, brand, inspiration, family, collection, active`
- **product_variants** — `id, product_id, ml, price_inr, active`  (UNIQUE product_id+ml)
- **inventory** — `variant_id PK, qty_available, reserved`
- **orders** — `id (uuid), order_number (AQ-YYYY-NNNNN unique), tracking_token_hash (sha-256 hex),
  idempotency_key unique, customer_name, phone, email, address_*, delivery_instructions,
  subtotal_inr, shipping_inr, total_inr, status (legacy), payment_method, payment_status,
  customer_stage, utr_reference, created_at, updated_at`
- **order_items** — product + size + price snapshot
- **order_counters** — per-year monotonic sequence for order numbers
- **payments** — one row per attempt; method ∈ {upi_manual, razorpay}; status covers the full lifecycle
- **payment_webhooks** — `event_id PK` for Razorpay redelivery dedupe
- **order_status_history** — append-only audit of internal + customer-facing stages
- **admin_users** — `username unique, password_hash (pbkdf2-sha256$100000$salt$hash)`
- **refunds** — gateway or manual refund records
- **coupons / notifications** — placeholders for later phases

Prices are stored as integer rupees. Amounts are converted to paise only at the Razorpay boundary.

---

## 4. Authorization model

| Surface | Gate |
|---|---|
| `/api/products`, `/api/orders`, `/api/orders/track/:token*`, `/api/track/:id`, `/api/payments/gateway/*` | Public |
| `/api/admin/setup` | Public, 409s once any admin exists |
| `/api/admin/login`, `/api/admin/logout` | Public |
| Everything else under `/api/admin/*` | 401 without a valid signed `admin_session` cookie |

Cookie format: `username.exp.hmac-sha256-b64url`. TTL 8 h. HttpOnly + Secure + SameSite=Strict. Signed with `env.ADMIN_SESSION_SECRET`.

---

## 5. Order lifecycle

1. **Checkout** (`POST /api/orders`)
   - Turnstile → price/stock lookup server-side → idempotency replay check → per-year counter bump → random 24-byte tracking token (only SHA-256 hash stored) → one `env.DB.batch` writes order + items + inventory reservation + pending `payments` row + status history.
   - Response: `{ id, orderNumber, totalInr, upiLink, trackUrl }`.
2. **Customer pays**
   - **Option A (UPI manual)** — opens their UPI app via the deep link, submits the UTR on the track page. UTR moves `payment_status` to `submitted`, never `paid`.
   - **Option B (Razorpay)** — SDK on track page opens checkout. On success the handler calls `/verify`; webhook is the source of truth.
3. **Admin verifies / rejects / cancels / refunds** from `admin.html`. Every action writes `order_status_history`.
4. **Admin advances internal status**. Map `INTERNAL_TO_CUSTOMER` (in `functions/_shared/config.js`) collapses the 9 internal statuses into 5 customer-facing stages. The customer only ever sees: **Order Confirmed → Processing → Shipped → Out for Delivery → Delivered** (+ Cancelled).
5. **Notifications** fire on: order created, payment verified (manual + gateway), shipped, delivered, cancelled. Email via Resend, WhatsApp via Meta Cloud API. Unconfigured channels are recorded as `skipped`.

---

## 6. Environment variables

Set these in Pages → Settings → Environment Variables (prod) and `.dev.vars` (local).

| Variable | Purpose | Required |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Bot check on checkout | Yes (prod) |
| `ADMIN_SESSION_SECRET` | HMAC for admin cookie | Yes |
| `PUBLIC_BASE_URL` | Absolute links in notifications | Yes for notify |
| `PAYMENT_GATEWAY_KEY_ID` | Razorpay key id (test or live) | For gateway path |
| `PAYMENT_GATEWAY_KEY_SECRET` | Razorpay secret | For gateway path |
| `PAYMENT_GATEWAY_WEBHOOK_SECRET` | Razorpay webhook signing secret | For gateway path |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `NOTIFY_BCC_EMAIL` | Email sender | For email |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API | For WhatsApp |
| `ENFORCE_INVENTORY=1` | Hard-stop orders when stock_free < qty | Flip after stocking |

Place real UPI identity and the flat shipping fee in `functions/_shared/config.js` — these are intentionally not env-vars because they change rarely.

---

## 7. Local development

```
npm install -g wrangler
# apply schema + seed + migrations to local D1
wrangler d1 execute alqawiperfumes-db --local --file=schema.sql
wrangler d1 execute alqawiperfumes-db --local --file=seed.sql
wrangler d1 execute alqawiperfumes-db --local --file=migrations/001_v2_core.sql
wrangler d1 execute alqawiperfumes-db --local --file=migrations/002_order_tokens.sql
wrangler d1 execute alqawiperfumes-db --local --file=migrations/003_customer_contact.sql
wrangler pages dev .
```

For the Turnstile widget in local use Cloudflare's always-passing test keys (`1x00000000000000000000AA` site, `1x0000000000000000000000000000000AA` secret). Bootstrap the first admin with:
```
curl -X POST http://localhost:8788/api/admin/setup \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"local-admin-pw-123"}'
```

Inspect state:
```
wrangler d1 execute alqawiperfumes-db --local --command="SELECT order_number, payment_status, customer_stage FROM orders ORDER BY created_at DESC LIMIT 5"
```
Reset local DB: delete `.wrangler/state/v3/d1` and re-run the three migrations.

---

## 8. Deploying

1. `wrangler d1 create alqawiperfumes-db` → copy the id into `wrangler.toml`.
2. Apply migrations against `--remote`:
   ```
   wrangler d1 execute alqawiperfumes-db --remote --file=schema.sql
   wrangler d1 execute alqawiperfumes-db --remote --file=seed.sql
   wrangler d1 execute alqawiperfumes-db --remote --file=migrations/001_v2_core.sql
   wrangler d1 execute alqawiperfumes-db --remote --file=migrations/002_order_tokens.sql
   wrangler d1 execute alqawiperfumes-db --remote --file=migrations/003_customer_contact.sql
   ```
3. Set the env vars from section 6 in the Pages project settings.
4. Real Turnstile keys in `checkout.html` + `TURNSTILE_SECRET_KEY`.
5. `wrangler pages deploy .` (or wire git-based deploys).
6. `curl -X POST https://<prod>/api/admin/setup -d '{"username":"you","password":"…"}'` once.
7. In the Razorpay dashboard add a webhook pointing at `https://<prod>/api/payments/gateway/webhook` subscribing to `payment.captured` and `payment.failed`.

---

## 9. Extending

- **New payment provider**: implement the three functions in `functions/_shared/razorpay.js` for the new provider under `functions/_shared/<provider>.js`; replace the import in the three endpoints under `functions/api/payments/gateway/`. Database already distinguishes providers via `payments.method`.
- **More admin tabs**: follow the pattern in `admin.html`/`admin.js` — a `<button data-tab=…>` toggles sections, each section lazy-loads via its own `api()` call. Server-side, create a file under `functions/api/admin/` and the middleware authenticates it for free.
- **CSV exports / invoices**: hook new GETs under `functions/api/admin/`; set appropriate `content-type` and return a plain `Response`.
- **Charts on the dashboard**: all the series needed are already in `GET /api/admin/reports/sales` (`daily`, `bySize`, `bestSellers`, `byCollection`). Drop in Chart.js or a small SVG renderer.
- **Coupons**: `coupons` table is in place. Apply them inside `functions/api/orders.js` before the `totalInr` calculation; store the applied code on the order for admin reporting.

---

## 10. Deferred items (`shortcut:` in code)

These are intentionally parked. Each has an inline comment showing the exact line.

- `functions/_shared/config.js` — `SHIPPING_FEE_INR`, `UPI_VPA`, `UPI_PAYEE_NAME` are placeholders.
- `functions/_shared/config.js` — `ENFORCE_INVENTORY_DEFAULT=false` until real stock is entered.
- `functions/_shared/notify.js` — WhatsApp uses free-form text (fine inside the 24-hour customer-service window; needs an approved template for the first message of a conversation).
- `app.js` — only 15 hand-designed background scenes exist; cycled for 35-item catalogue until bespoke per-item art lands.
- `checkout.js` — `SHIPPING_FEE_INR` duplicated from the server config; move to an API read once there's more than one configurable fee.

Nothing is required to launch in sandbox mode. These become must-fixes only when you turn on real payments and real stock.

---

## 11. What is not here yet

Wishlist, customer reviews, coupon enforcement (table exists, endpoint doesn't), PDF invoices, CSV inventory export, gift packaging, abandoned-cart recovery, courier tracking numbers on the admin UI, dashboard charts (data is in the reports endpoint). The spec classifies all of these as nice-to-haves after the core works.

Testing: there are no automated tests. The 23-item verification checklist in the brief can be walked through manually against a local dev server; a scripted pass is a one-afternoon job once you want it.
