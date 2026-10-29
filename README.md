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
src/app/api/               Auth.js route (payment webhooks come later)
src/app/placeholder/       generated SVG images for seed data (works offline)
src/server/                server-only code: db client, catalog/search, auth guards, rate limiting
src/lib/                   shared helpers and Zod validation schemas
src/i18n/, src/messages/   routing and translations
src/proxy.ts               locale routing + sign-in gate for protected areas
tests/unit/                Vitest tests
```

### Conventions

- **Money** is stored as integer agorot (`12990` = ₪129.90). Rates are basis points (`1000` = 10%).
- **Access control** has two layers. `src/proxy.ts` sends signed-out visitors away from `/account`, `/seller`, `/admin` and `/checkout`. Every protected page and server action then calls a guard from `src/server/auth/guards.ts`, which re-reads the user's role and status from the database, so a suspended or demoted user loses access immediately.
- **Payments** go through a local Israeli marketplace payment provider (chosen in Phase 3). No card data is stored; the schema keeps only the provider's references.
- **Search** uses Postgres full-text search (`simple` config, prefix matching) plus `pg_trgm` for substring and typo matches, on a generated `searchVector` column. Filters and sorting live in the URL (`src/lib/catalog-query.ts`), so every result page can be shared and bookmarked. For a much larger catalog, move search to Meilisearch or similar.
- **Caching**: the home page is static and refreshed every 5 minutes; product pages are cached on first visit and refreshed every 5 minutes. The header has no server-side session read, so it doesn't make pages dynamic; the signed-in menu loads in the browser.
- **Rate limiting** on sign-in and sign-up is in memory, which suits a single server. Move it to Redis before running several instances.
