# Marketplace

A multi-vendor marketplace: independent shops list products, customers buy from many shops in one checkout, and the platform keeps a commission on each sale.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 7 · Auth.js v5 · next-intl (Hebrew, Arabic, English, with RTL) · prices in ILS.

## Getting started

Requirements: Node.js 20.9+ and PostgreSQL 16 (or Docker).

```bash
cp .env.example .env          # then set AUTH_SECRET: npx auth secret
docker compose up -d          # skip if you already run Postgres locally
npm install                   # also generates the Prisma client
npm run db:migrate            # create the tables
npm run db:seed               # categories, 3 shops, 30 products, 36 past orders, reviews
npm run dev                   # http://localhost:3000 → redirects to /he
```

`npm run build` needs the database running: it pre-renders the home page and the sitemap from it.

### Seeded accounts

Every account uses the password in `SEED_PASSWORD` (default `Password123!`).

| Email | Role |
| --- | --- |
| `admin@example.com` | Admin |
| `customer@example.com` | Customer (also `noa@`, `ahmad@`, `yael@`, `mohammad@` with past orders) |
| `seller.tech@example.com` | Seller — TechZone (electronics) |
| `seller.home@example.com` | Seller — Bayit Design (home & kitchen) |
| `seller.fashion@example.com` | Seller — Urban Wear (fashion) |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | Tests against the database: payments, sellers, admin, reviews, email (needs a migrated, seeded DB) |
| `npm run test:e2e` | Browser tests of the main journeys against a production build (run `npm run build` first) |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed sample data (safe to re-run) |
| `npm run db:studio` | Browse the database |

## How it's organized

```
prisma/                    schema, migrations, seed
src/app/[locale]/          pages, one tree per language (he | ar | en)
src/app/api/               Auth.js, payment webhooks, cron jobs, cart count
src/app/placeholder/       generated SVG images for seed data (works offline)
src/app/[locale]/seller/   seller dashboard; /sell is the application form
src/app/[locale]/admin/    admin panel
src/server/                server-only code: db, catalog/search, cart, orders, payments, auth guards, rate limiting
src/server/payments/       payment provider adapters + the payment/refund/ledger service
src/server/seller/         seller products, discounts, fulfilment, returns, analytics
src/server/admin/          shops, moderation, categories/banners/settings, orders/disputes, payouts, reports, users
src/server/storage/        image uploads (Cloudinary, or local files in development)
src/lib/                   shared helpers and Zod validation schemas
src/i18n/, src/messages/   routing and translations
src/proxy.ts               locale routing + sign-in gate for protected areas
tests/unit/                Vitest unit tests
tests/integration/         Vitest tests against the database
tests/e2e/                 Playwright browser tests
.github/workflows/ci.yml   CI: lint, types, unit, integration, build, e2e
```

### Conventions

- **Money** is stored as integer agorot (`12990` = ₪129.90). Rates are basis points (`1000` = 10%).
- **Access control** has two layers. `src/proxy.ts` sends signed-out visitors away from `/account`, `/seller`, `/admin` and `/checkout`. Every protected page and server action then calls a guard from `src/server/auth/guards.ts`, which re-reads the user's role and status from the database, so a suspended or demoted user loses access immediately.
- **Payments**: see below.
- **Search** uses Postgres full-text search (`simple` config, prefix matching) plus `pg_trgm` for substring and typo matches, on a generated `searchVector` column. Filters and sorting live in the URL (`src/lib/catalog-query.ts`), so every result page can be shared and bookmarked. For a much larger catalog, move search to Meilisearch or similar.
- **Caching**: the home page is static and refreshed every 5 minutes; product pages are cached on first visit and refreshed every 5 minutes. The header has no server-side session read, so it doesn't make pages dynamic; the signed-in menu loads in the browser.
- **Rate limiting** on sign-in and sign-up is in memory, which suits a single server. Move it to Redis before running several instances.

## Payments

The customer pays once for a cart that can hold items from several shops. The order is split into one sub-order per shop, each with its own status, shipping and tracking.

**Money flow** ("collect, then pay out"): the platform collects the full payment through its payment provider. For each shop the ledger books the sale (items + that shop's shipping) and the platform's commission. A shop's money is **held** until the sub-order is delivered and the return window (14 days by default) has passed, then **released** to the shop's balance for payout. Refunds take the refunded amount back from the shop and return the matching share of commission.

**Pricing rules** (`src/lib/pricing.ts`, all unit-tested):

- Prices include 18% VAT; the receipt shows the VAT part.
- Shipping is charged per shop: ₪29.90, free when that shop's part of the order is ₪199 or more. Both are in `PlatformSettings`.
- Commission is taken on item prices, not shipping. Rate: the shop's own rate if set, else the category's (inherited from its parent), else the global rate (10%).

**Checkout safety**: stock is reserved when the order is placed and released if payment fails or isn't completed within 30 minutes. Prices are re-checked when stock is reserved. A single-use checkout token stops double-clicks from creating two orders. Only the provider's signed webhook can mark an order paid, and only for the exact amount; each webhook is applied once even if the provider retries it.

### Payment providers

Providers are adapters in `src/server/payments/providers/` implementing `PaymentProvider` (`src/server/payments/types.ts`): start a payment and return the hosted payment page URL, verify and parse webhooks, and refund. Register a new adapter in `src/server/payments/index.ts` and set `PAYMENT_PROVIDER`.

The built-in **`test` provider** has its own "payment page" with Approve and Decline buttons, and sends signed webhooks through the same code path as a real provider. No card details are ever entered. It is disabled in production unless `ALLOW_TEST_PAYMENTS=true` (useful for a staging site).

### Scheduled jobs

Call this every 5 minutes (Vercel Cron, a system cron, …). It cancels unpaid orders whose payment window has passed and releases sellers' held funds:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/maintenance
```

## Sellers

**Becoming a seller**: any signed-in customer can apply at `/sell` (shop name and address, business details with a validated Israeli company/dealer number, and a bank account for payouts). The shop starts as *pending*: the seller can build their catalog right away, but nothing is public until an admin approves the shop (Phase 5). Bank details are encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`); only the last 4 digits are ever shown.

**Dashboard** (`/seller`):

- **Products**: create and edit with images, up to 3 options (size, color, …) generating variants with their own SKU, price, "was" price and stock, and specifications. *Publish* makes a product live; a product an admin rejected goes back to review. Products with orders are archived instead of deleted; removed variants that were ordered are kept (hidden) for order history.
- **CSV import**: one row per variant, rows grouped by `handle`; re-importing updates products by handle and variants by SKU. Download the template from the import page. Rows are validated and errors are listed by row number. CSV can't carry uploaded images, so products imported without images are saved as drafts.
- **Discounts**: percent or fixed, for one product or the whole shop, with start and end times (Israel time). The best live discount applies; prices in search, cart and checkout follow automatically, and the cron job re-prices products when discounts start or end.
- **Orders**: paid → preparing → shipped (carrier + tracking number, emailed to the customer) → delivered. Delivery starts the return window. The seller can cancel before shipping (full refund and restock).
- **Returns**: approve or reject the customer's request; once the item is back, refund in full or in part and optionally restock.
- **Earnings**: sales, commission, refunds and net for 7/30/90 days, a daily sales chart, best sellers, the commission on each order and the current rate per category, money held / available / paid out, and payout history.
- **Settings**: shop profile, logo and banner (shown on the public storefront `/s/<slug>`), and payout bank account (every change is audit-logged).

### Images

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` and the browser uploads straight to Cloudinary with a short-lived signature (JPG/PNG/WebP, 5 MB max). Without them, development stores uploads in `storage/uploads/` (git-ignored); this is off in production unless `ALLOW_LOCAL_UPLOADS=true`. Files are checked by their content, not their name, and product images may only come from these sources.

## Admin panel

Sign in as `admin@example.com` and open `/admin`. Every admin page and action re-checks the admin role against the database, and every change is written to the activity log (`/admin/audit`).

- **Overview**: sales, commission, orders and average order for the last 30 days, plus a to-do list (seller applications, products to review, open disputes, flagged reviews, payouts due).
- **Sellers**: approve or reject applications; suspend (hides the shop and its products, the seller can still fulfil open orders), reactivate, or remove permanently (only once no orders are open; the owner loses the seller area). Set a per-shop commission rate. View the full payout bank account; each view is logged.
- **Products**: approve products sent back for review, reject with a note the seller sees, and feature products on the home page.
- **Reviews**: show, hide or delete; product and shop ratings are recalculated.
- **Orders**: search by order number or customer email; see every shipment, its commission and payout status, payment events and refunds; refund any amount (optionally cancelling a not-yet-shipped shipment and restocking).
- **Disputes**: customers report a problem on a shipment from their order page; the seller and the admin reply in the same thread; the admin resolves it, optionally with a refund.
- **Payouts**: shows each seller's available balance (released sales, net of refunds). Transfer it from the bank, then record it here with the bank reference: the ledger, the seller's balance and payout history update.
- **Revenue**: GMV, commission earned (net of refunds), orders, average order, refunds, new customers and applications for 7/30/90/365 days; daily GMV and commission charts; top sellers and categories; CSV export for accounting.
- **Categories**: two levels (top level and leaves; products live in leaves), names in all three languages, commission per category (inherited from the parent when empty), order, image, active flag.
- **Banners**: home page banners with an image, titles in three languages, a link inside the site, and an optional schedule.
- **Settings**: default commission, VAT, shipping per seller and the free-shipping threshold, return window and payment window. Changes apply to new orders only.
- **Users**: search, suspend and reactivate accounts (not admins). A suspended user's session ends at its next check (within a minute).

## Reviews and saved items

- **Reviews** are for verified buyers only: once a shipment is delivered, each item on the order page gets a "Write a review" form (1–5 stars, title, text), which can be edited or deleted later. Ratings for the product and the shop are recalculated on every change.
- Shoppers can **report** a review. Reported reviews stay visible until an admin decides (`/admin/reviews`, "Flagged"), so a report alone can't hide someone's review.
- **Sellers** answer reviews publicly from `/seller/reviews`.
- **Saved items**: the heart on a product page saves it to `/account/wishlist`.

## Accounts and email

- **Email confirmation**: new accounts get a confirmation link (24 hours). Unconfirmed accounts work normally, with a reminder on the account page.
- **Password reset** at `/forgot-password`: the link works once, for one hour. The response is the same whether or not the email has an account. Changing the password signs out every other session (within a minute).
- Tokens are stored as SHA-256 hashes, and links are wiped from the email log once sent.
- **Emails** (order confirmed, new order for the seller, shipped with tracking, delivered with a review prompt, refunds, returns, disputes, shop and product decisions, payouts) are queued in the same transaction as the change, sent right after the response, and retried by the cron job (up to 5 attempts). They're written in the recipient's language (the one they last signed in with) and laid out right-to-left for Hebrew and Arabic. Set `RESEND_API_KEY` and `EMAIL_FROM` to send through [Resend](https://resend.com); without them, emails are printed to the server log.

## Security summary

- Passwords: bcrypt (cost 12). Sessions: signed JWT cookies; role and status re-checked against the database on every protected page and action.
- Rate limits on sign-in, sign-up, password reset, cart, checkout and account actions.
- All input validated with Zod on the server; SQL is parameterized; user content is escaped (React, emails, JSON-LD, CSV export).
- No card data is stored. Payment webhooks are signature-checked and applied once. Sellers' bank details are encrypted (AES-256-GCM).
- Uploads: type checked by content, 5 MB limit, only from this site or our Cloudinary account.
- Headers: Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, and HSTS in production.
- Every admin action is in the activity log.

## Going to production

1. **Database**: managed PostgreSQL 16; run `npm run db:deploy` on each release. Don't run the seed in production.
2. **Environment** (see `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` and `NEXT_PUBLIC_SITE_URL` (your https domain), `DATA_ENCRYPTION_KEY` (keep a backup: without it bank details can't be read), `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET`, Cloudinary keys, `RESEND_API_KEY` + `EMAIL_FROM` (a domain verified in Resend).
3. **Payments**: add the adapter for your provider (see "Payment providers") and set `PAYMENT_PROVIDER`. The test provider is off in production.
4. **Cron**: call `/api/cron/maintenance` every 5 minutes with the `CRON_SECRET` bearer token.
5. **More than one server instance**: move the rate limiter's store to Redis (`src/server/rate-limit.ts`).
6. **First admin**: create an account, then set its `role` to `ADMIN` in the database.
