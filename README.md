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
npm run db:seed               # sample categories, 3 shops, 30 products
npm run dev                   # http://localhost:3000 → redirects to /he
```

`npm run build` needs the database running: it pre-renders the home page and the sitemap from it.

### Seeded accounts

Every account uses the password in `SEED_PASSWORD` (default `Password123!`).

| Email | Role |
| --- | --- |
| `admin@example.com` | Admin |
| `customer@example.com` | Customer |
| `seller.tech@example.com` | Seller — TechZone (electronics) |
| `seller.home@example.com` | Seller — Bayit Design (home & kitchen) |
| `seller.fashion@example.com` | Seller — Urban Wear (fashion) |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | Payment/order tests against the database (needs a migrated, seeded DB) |
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
src/server/                server-only code: db, catalog/search, cart, orders, payments, auth guards, rate limiting
src/server/payments/       payment provider adapters + the payment/refund/ledger service
src/lib/                   shared helpers and Zod validation schemas
src/i18n/, src/messages/   routing and translations
src/proxy.ts               locale routing + sign-in gate for protected areas
tests/unit/                Vitest unit tests
tests/integration/         Vitest tests against the database
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
