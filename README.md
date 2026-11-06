<<<<<<< HEAD
# Alqawiperfumes — e-commerce site on Cloudflare Pages

Static frontend (vanilla HTML/CSS/JS) + Cloudflare Pages Functions API + D1 database. Deploys as one Cloudflare Pages project, entirely on Cloudflare's free tier at this site's scale.

## Deploy steps (one-time setup)
1. `npm install -g wrangler` (or `npx wrangler`), then `wrangler login`.
2. Create the database: `wrangler d1 create alqawiperfumes-db` — copy the returned `database_id` into `wrangler.toml`.
3. Apply the schema and seed data:
   `wrangler d1 execute alqawiperfumes-db --remote --file=schema.sql`
   `wrangler d1 execute alqawiperfumes-db --remote --file=seed.sql`
   `wrangler d1 execute alqawiperfumes-db --remote --file=migrations/001_v2_core.sql`  # adds collections, premium catalogue, spec prices, inventory/payments/admin tables
4. Get a free [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) site+secret key pair. Put the **site key** in `checkout.html` (`data-sitekey="..."`). Set the **secret key** as a Pages environment variable/secret named `TURNSTILE_SECRET_KEY` in the Pages project settings.
5. Set your real UPI ID and payee name in `functions/_shared/config.js` (`UPI_VPA`, `UPI_PAYEE_NAME`), and the real flat shipping fee (`SHIPPING_FEE_INR`).

### Razorpay (optional second payment method)
Set these as Pages env secrets. Test-mode keys from the Razorpay dashboard work for end-to-end verification without charging a card:
- `PAYMENT_GATEWAY_KEY_ID` — `rzp_test_…` or `rzp_live_…`
- `PAYMENT_GATEWAY_KEY_SECRET`
- `PAYMENT_GATEWAY_WEBHOOK_SECRET` — any string you also paste into Razorpay's webhook config

In the Razorpay dashboard, add a webhook pointing at `https://yourdomain.com/api/payments/gateway/webhook`, subscribing to `payment.captured` and `payment.failed`. The endpoint dedupes by `x-razorpay-event-id`, so Razorpay's redelivery is safe.

### Notifications (optional)
Everything still works without these; delivery just gets recorded as `skipped`.
- Email via [Resend](https://resend.com): `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL=you@yourdomain.com`, and (for now, until customer emails are collected) `NOTIFY_BCC_EMAIL=you@yourdomain.com`.
- WhatsApp Business Cloud: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Free-form text works only inside WhatsApp's 24-hour customer-service window; for the first touch after an order you need an approved template (not wired yet — speak up and I'll add one).
- `PUBLIC_BASE_URL=https://yourdomain.com` so the tracking links inside messages are absolute.

6. Deploy: `wrangler pages deploy .` (or connect the repo for git-based deploys).
7. **Admin auth** — set a long random secret `ADMIN_SESSION_SECRET` in the Pages environment (e.g. `openssl rand -base64 48`). Then bootstrap the first admin by POSTing once to `/api/admin/setup`:
   `curl -X POST https://yourdomain.com/api/admin/setup -H 'content-type: application/json' -d '{"username":"you","password":"a-long-password"}'`
   This endpoint 409s once any admin exists. Optional belt-and-braces: also put a Cloudflare Access policy over `/admin*`.
8. Set prices per product/size in the admin dashboard (`/admin.html`) — products with no price are hidden from checkout automatically.

## What's here
- `index.html`/`app.js`/`catalog.js`/`styles.css`/`brand.css` — the public catalog (unchanged browsing experience, now links to real checkout)
- `checkout.html`/`checkout.js` — cart review, delivery form, Turnstile bot check, order creation, UPI payment link
- `track.html`/`track.js` — public order status lookup by order ID, and UPI payment reference (UTR) submission
- `admin.html`/`admin.js` — order list/status updates, basic revenue count, product/price management (must be Access-protected, see step 7)
- `functions/` — Cloudflare Pages Functions (the API), backed by D1 (`schema.sql`)
- `_headers` — security headers (CSP, frame/content-type protections)

## Payment model
No merchant account: customers pay via a UPI deep link generated per order (opens their UPI app directly on mobile) and submit the transaction reference (UTR) on the tracking page. You verify the UTR against your own UPI app and mark the order "paid" manually in admin — there is no automated payment verification. This is a known limitation of using a personal UPI ID; move to a payment aggregator (Razorpay/Instamojo individual KYC) if order volume grows, since sustained commercial use of a personal UPI ID sits in a compliance grey area under RBI/NPCI rules.

## Brand and design
The supplied Alqawiperfumes logo appears in the header and footer. The supplied gold crystal bottle is used in the hero, all 15 catalog cards and every product detail view. Original PNG files are preserved unchanged. CSS blends their black backgrounds into the dark compositions.

The site uses a black, champagne and gold theme. Each fragrance has its own CSS background in brand.css: rose petals, architectural gold, blue geometry, warm evening light, violet velvet, golden glow, planetary rings, forest geometry, desert horizons, amber halos, midnight stars, crimson facets, ember light, coastal green ripples and blue waves. These are artistic interpretations of the names, not ingredient claims.

## Features
15 inspiration products; search; scent-family filters; product dialogs; browser-local shortlist with remove/clear controls; individual and combined WhatsApp enquiries to +918801470568; responsive layouts; FAQ and privacy information. This is an enquiry storefront, not payment checkout. All brand references are clearly marked as inspirations with an independence disclaimer.

## Content still to confirm
- Currency and prices; bottle sizes and concentration; availability and customisation options.
- Delivery regions, fees and timelines; payment and return/refund terms; business address and final privacy details.
- Approval of the suggested independent collection names and browsing families.
- Oudh and Roses / Bin Shaik spelling and Baccarat Rouge 540 version (EDP or Extrait). 1MFK was interpreted as Maison Francis Kurkdjian.

## Editing
Catalog records are in catalog.js. Unique record IDs map to .scene-01 through .scene-15 in brand.css. Site copy and contact details are in index.html, with WhatsApp message construction in app.js. Base layout is styles.css; final brand styling is brand.css. Keep all local paths together. Prices remain 'Price on enquiry' until confirmed.

No analytics, remote fonts or external asset dependencies are included. Selection is stored in localStorage under perfume-selection-v1. Clear selection removes the selected items. WhatsApp opens a draft message; the visitor must send it themselves.

## Verification
Checked all 15 cards and image loading, matching product-detail bottle/background, desktop and 390px mobile layout (no horizontal overflow), and shortlist message destination. JavaScript syntax checks passed. No message was sent.
=======
# AlQawiPerfumes
Alqawi Perfumes – E-commerce Website  A modern, responsive e-commerce platform for a premium perfume store, featuring Standard and Premium fragrance collections
>>>>>>> 115599d58c29326648f4c6bad096439f49a9787b
