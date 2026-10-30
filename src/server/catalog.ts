import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { PAGE_SIZE, escapeLike, toPrefixTsQuery, type CatalogQuery } from "@/lib/catalog-query";
import { descendantIds, type CategoryNode } from "@/lib/category-tree";
import { priceSummary } from "@/lib/variant-options";
import { effectivePrice, type DiscountRule } from "@/lib/pricing";
import { discountSelects } from "@/server/discounts";

export const CATALOG_TAG = "catalog";
export const CATEGORIES_TAG = "categories";

// Only active products from approved shops are ever public.
const VISIBLE: Prisma.ProductWhereInput = { status: "ACTIVE", shop: { status: "APPROVED" } };

// ───────────────────────── Categories ─────────────────────────

export const getCategories = unstable_cache(
  async (): Promise<CategoryNode[]> =>
    db.category.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, parentId: true, name: true, imageUrl: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    }),
  ["categories"],
  { tags: [CATEGORIES_TAG], revalidate: 3600 },
);

export async function getCategoryBySlug(slug: string) {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

// ───────────────────────── Product cards ─────────────────────────

/** Card fields, with the discounts live at `now` so card prices include them. */
function cardSelect(now: Date) {
  const discounts = discountSelects(now);
  return {
    id: true,
    slug: true,
    title: true,
    ratingAvg: true,
    ratingCount: true,
    shop: { select: { name: true, slug: true, discounts: discounts.shop } },
    images: { select: { url: true, alt: true }, orderBy: { position: "asc" }, take: 1 },
    variants: { where: { isActive: true }, select: { priceMinor: true, compareAtMinor: true, stock: true } },
    discounts: discounts.product,
  } satisfies Prisma.ProductSelect;
}

type CardRow = Prisma.ProductGetPayload<{ select: ReturnType<typeof cardSelect> }>;

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  image: { url: string; alt: string } | null;
  shopName: string;
  shopSlug: string;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  compareAt: number | null;
  discountPct: number;
  inStock: boolean;
};

function toCard(row: CardRow, now: Date): ProductCardData {
  const image = row.images[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    image: image ? { url: image.url, alt: image.alt ?? row.title } : null,
    shopName: row.shop.name,
    shopSlug: row.shop.slug,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    ...priceSummary(withDiscounts(row.variants, row.id, [...row.discounts, ...row.shop.discounts], now)),
  };
}

/** Variants with prices after live discounts (compare-at becomes the "was" price). */
export function withDiscounts<V extends { priceMinor: number; compareAtMinor: number | null }>(
  variants: V[],
  productId: string,
  rules: DiscountRule[],
  now: Date,
): (V & { basePriceMinor: number })[] {
  return variants.map((v) => {
    const price = effectivePrice(v, productId, rules, now);
    return { ...v, basePriceMinor: v.priceMinor, priceMinor: price.priceMinor, compareAtMinor: price.compareAtMinor };
  });
}

async function cards(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], take: number) {
  const now = new Date();
  const rows = await db.product.findMany({ where: { AND: [VISIBLE, where] }, select: cardSelect(now), orderBy, take });
  return rows.map((row) => toCard(row, now));
}

// ───────────────────────── Home page ─────────────────────────

// Kept up to date by refreshProductPricing (src/server/discounts.ts).
const hasMarkdown: Prisma.ProductWhereInput = { hasDeal: true };

export async function getHomeData() {
  const now = new Date();
  const [banners, deals, featured, newest] = await Promise.all([
    db.banner.findMany({
      where: {
        placement: "home-hero",
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      // Ties go to the newest, so a banner an admin just added shows up.
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    cards(hasMarkdown, [{ salesCount: "desc" }, { createdAt: "desc" }], 8),
    cards({ isFeatured: true }, [{ salesCount: "desc" }, { createdAt: "desc" }], 8),
    cards({}, [{ createdAt: "desc" }], 8),
  ]);
  return { banners, deals, featured, newest };
}

// ───────────────────────── Search ─────────────────────────

const MAX_TEXT_MATCHES = 1000;

/** Ids of visible products matching free text, best match first. */
async function textSearch(q: string): Promise<{ id: string; rank: number }[]> {
  const tsQuery = toPrefixTsQuery(q);
  const exact = escapeLike(q);
  const like = `%${exact}%`;
  // Parameterized: every ${} below is sent as a bind parameter, not spliced into SQL.
  return db.$queryRaw<{ id: string; rank: number }[]>`
    SELECT p.id,
           (CASE WHEN ${tsQuery} <> '' THEN ts_rank(p."searchVector", to_tsquery('simple', ${tsQuery})) ELSE 0 END) * 2
           + similarity(p.title, ${q})
           + (CASE WHEN b.name ILIKE ${exact} THEN 1 ELSE 0 END) AS rank
    FROM "Product" p
    JOIN "Shop" s ON s.id = p."shopId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    WHERE p.status = 'ACTIVE' AND s.status = 'APPROVED'
      AND (
        (${tsQuery} <> '' AND p."searchVector" @@ to_tsquery('simple', ${tsQuery}))
        OR p.title ILIKE ${like}
        OR p.title % ${q}
        OR b.name ILIKE ${like}
      )
    ORDER BY rank DESC, p."salesCount" DESC
    LIMIT ${MAX_TEXT_MATCHES}`;
}

export type CatalogScope = {
  categoryId?: string;
  shopId?: string;
};

export type Facet = { slug: string; name: unknown; count: number };

export type CatalogResult = {
  items: ProductCardData[];
  total: number;
  page: number;
  pageCount: number;
  facets: {
    categories: Facet[];
    brands: Facet[];
    shops: Facet[];
    price: { min: number; max: number } | null;
  };
};

const ORDER: Record<Exclude<CatalogQuery["sort"], "relevance">, Prisma.ProductOrderByWithRelationInput[]> = {
  popular: [{ salesCount: "desc" }, { isFeatured: "desc" }, { createdAt: "desc" }],
  newest: [{ createdAt: "desc" }],
  "price-asc": [{ minPriceMinor: "asc" }, { createdAt: "desc" }],
  "price-desc": [{ minPriceMinor: "desc" }, { createdAt: "desc" }],
  rating: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
};

type FilterKey = "categories" | "brands" | "shops" | "price" | "other";

export async function searchCatalog(query: CatalogQuery, scope: CatalogScope = {}): Promise<CatalogResult> {
  const now = new Date();
  const allCategories = await getCategories();
  const bySlug = new Map(allCategories.map((c) => [c.slug, c]));

  // Scope: fixed by the page (category page, shop storefront).
  const scopeWhere: Prisma.ProductWhereInput[] = [VISIBLE];
  if (scope.categoryId) scopeWhere.push({ categoryId: { in: descendantIds(allCategories, scope.categoryId) } });
  if (scope.shopId) scopeWhere.push({ shopId: scope.shopId });

  let ranked: Map<string, number> | null = null;
  if (query.q) {
    const matches = await textSearch(query.q);
    ranked = new Map(matches.map((m, i) => [m.id, i]));
    scopeWhere.push({ id: { in: matches.map((m) => m.id) } });
  }

  // User filters, keyed so each facet can be counted without its own filter.
  const filters: Partial<Record<FilterKey, Prisma.ProductWhereInput[]>> = {};
  const add = (key: FilterKey, where: Prisma.ProductWhereInput) => (filters[key] ??= []).push(where);

  if (query.categories.length) {
    const ids = query.categories
      .map((slug) => bySlug.get(slug))
      .filter((c) => c !== undefined)
      .flatMap((c) => descendantIds(allCategories, c.id));
    add("categories", { categoryId: { in: ids } });
  }
  if (query.brands.length) add("brands", { brand: { slug: { in: query.brands } } });
  if (query.shops.length) add("shops", { shop: { slug: { in: query.shops } } });
  if (query.minPrice !== undefined) add("price", { minPriceMinor: { gte: query.minPrice } });
  if (query.maxPrice !== undefined) add("price", { minPriceMinor: { lte: query.maxPrice } });
  if (query.rating) add("other", { ratingAvg: { gte: query.rating } });
  if (query.inStock) add("other", { variants: { some: { isActive: true, stock: { gt: 0 } } } });
  if (query.deals) add("other", hasMarkdown);

  const whereWithout = (skip?: FilterKey): Prisma.ProductWhereInput => ({
    AND: [
      ...scopeWhere,
      ...Object.entries(filters)
        .filter(([key]) => key !== skip)
        .flatMap(([, list]) => list),
    ],
  });
  const where = whereWithout();

  const [total, categoryGroups, brandGroups, shopGroups, priceRange] = await Promise.all([
    db.product.count({ where }),
    db.product.groupBy({ by: ["categoryId"], where: whereWithout("categories"), _count: { _all: true } }),
    db.product.groupBy({ by: ["brandId"], where: whereWithout("brands"), _count: { _all: true } }),
    db.product.groupBy({ by: ["shopId"], where: whereWithout("shops"), _count: { _all: true } }),
    db.product.aggregate({ where: whereWithout("price"), _min: { minPriceMinor: true }, _max: { minPriceMinor: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const skip = (page - 1) * PAGE_SIZE;

  let rows: CardRow[];
  if (query.sort === "relevance" && ranked) {
    // Order by text rank, which Prisma can't express; page in memory over ids only.
    const ids = (await db.product.findMany({ where, select: { id: true } }))
      .map((r) => r.id)
      .sort((a, b) => ranked.get(a)! - ranked.get(b)!)
      .slice(skip, skip + PAGE_SIZE);
    const byId = new Map((await db.product.findMany({ where: { id: { in: ids } }, select: cardSelect(now) })).map((r) => [r.id, r]));
    rows = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);
  } else {
    const sort = query.sort === "relevance" ? "popular" : query.sort;
    rows = await db.product.findMany({ where, select: cardSelect(now), orderBy: ORDER[sort], skip, take: PAGE_SIZE });
  }

  const facets = await buildFacets(categoryGroups, brandGroups, shopGroups, allCategories, scope);

  return {
    items: rows.map((row) => toCard(row, now)),
    total,
    page,
    pageCount,
    facets: {
      ...facets,
      price:
        priceRange._min.minPriceMinor !== null && priceRange._max.minPriceMinor !== null
          ? { min: priceRange._min.minPriceMinor, max: priceRange._max.minPriceMinor }
          : null,
    },
  };
}

async function buildFacets(
  categoryGroups: { categoryId: string; _count: { _all: number } }[],
  brandGroups: { brandId: string | null; _count: { _all: number } }[],
  shopGroups: { shopId: string; _count: { _all: number } }[],
  allCategories: CategoryNode[],
  scope: CatalogScope,
) {
  const brandIds = brandGroups.map((g) => g.brandId).filter((id) => id !== null);
  const [brands, shops] = await Promise.all([
    db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, slug: true, name: true } }),
    scope.shopId
      ? Promise.resolve([])
      : db.shop.findMany({ where: { id: { in: shopGroups.map((g) => g.shopId) } }, select: { id: true, slug: true, name: true } }),
  ]);

  // Roll leaf counts up to the categories one level below the current scope.
  const byId = new Map(allCategories.map((c) => [c.id, c]));
  const level = allCategories.filter((c) => c.parentId === (scope.categoryId ?? null));
  const categoryCounts = level
    .map((c) => {
      const ids = new Set(descendantIds(allCategories, c.id));
      const count = categoryGroups.filter((g) => ids.has(g.categoryId)).reduce((n, g) => n + g._count._all, 0);
      return { slug: c.slug, name: byId.get(c.id)!.name, count };
    })
    .filter((f) => f.count > 0);

  const sortFacets = (list: Facet[]) => list.sort((a, b) => b.count - a.count || String(a.slug).localeCompare(b.slug));
  return {
    categories: categoryCounts,
    brands: sortFacets(
      brands.map((b) => ({ slug: b.slug, name: b.name, count: brandGroups.find((g) => g.brandId === b.id)!._count._all })),
    ),
    shops: sortFacets(
      shops.map((s) => ({ slug: s.slug, name: s.name, count: shopGroups.find((g) => g.shopId === s.id)!._count._all })),
    ),
  };
}

// ───────────────────────── Product page ─────────────────────────

export async function getProductBySlug(slug: string) {
  const now = new Date();
  const discounts = discountSelects(now);
  const product = await db.product.findFirst({
    where: { slug, ...VISIBLE },
    include: {
      discounts: discounts.product,
      images: { orderBy: { position: "asc" } },
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, sku: true, attributes: true, priceMinor: true, compareAtMinor: true, stock: true },
      },
      brand: { select: { name: true, slug: true } },
      shop: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          ratingAvg: true,
          ratingCount: true,
          createdAt: true,
          discounts: discounts.shop,
          _count: { select: { products: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });
  if (!product) return null;
  const rules = [...product.discounts, ...product.shop.discounts];

  const [ratingGroups, reviews] = await Promise.all([
    db.review.groupBy({ by: ["rating"], where: { productId: product.id, status: "VISIBLE" }, _count: { _all: true } }),
    db.review.findMany({
      where: { productId: product.id, status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, rating: true, title: true, body: true, sellerReply: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: ratingGroups.find((g) => g.rating === stars)?._count._all ?? 0,
  }));

  return {
    ...product,
    variants: withDiscounts(product.variants, product.id, rules, now).map((v) => ({ ...v, attributes: v.attributes as Record<string, string> })),
    specs: (product.specs ?? {}) as Record<string, string>,
    reviews: reviews.map((r) => ({
      ...r,
      // Show first name only.
      author: r.user.name?.split(" ")[0] ?? "",
    })),
    ratingDistribution: distribution,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getRelatedProducts(productId: string, categoryId: string) {
  return cards({ categoryId, id: { not: productId } }, ORDER.popular, 8);
}

// ───────────────────────── Shops ─────────────────────────

export async function getShopBySlug(slug: string) {
  return db.shop.findFirst({
    where: { slug, status: "APPROVED" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
      ratingAvg: true,
      ratingCount: true,
      createdAt: true,
      _count: { select: { products: { where: { status: "ACTIVE" } } } },
    },
  });
}

// ───────────────────────── Sitemap ─────────────────────────

export async function getSitemapEntries() {
  const [products, shops, categories] = await Promise.all([
    db.product.findMany({ where: VISIBLE, select: { slug: true, updatedAt: true } }),
    db.shop.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true } }),
    db.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
  ]);
  return { products, shops, categories };
}
