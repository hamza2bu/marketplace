// Parses and serializes the catalog filters that live in the URL, e.g.
// /he/search?q=אוזניות&brand=soundmax&min=100&max=500&sort=price-asc&page=2
// Prices in the URL are whole shekels; internally they are agorot.

export const SORTS = ["relevance", "popular", "newest", "price-asc", "price-desc", "rating"] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZE = 24;
const MAX_PAGE = 500;
const MAX_LIST = 20;

export type CatalogQuery = {
  q: string;
  brands: string[];
  shops: string[];
  categories: string[];
  minPrice?: number; // agorot
  maxPrice?: number; // agorot
  rating?: number; // 1–4: "this many stars or more"
  inStock: boolean;
  deals: boolean;
  sort: Sort;
  page: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9-]{1,80}$/;

function list(value: string | string[] | undefined): string[] {
  const values = (Array.isArray(value) ? value : value ? [value] : []).flatMap((v) => v.split(","));
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter((v) => SLUG.test(v)))].slice(0, MAX_LIST);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function shekelsToAgorot(value: string | string[] | undefined): number | undefined {
  const raw = first(value)?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : undefined;
}

export function parseCatalogQuery(params: RawSearchParams): CatalogQuery {
  const q = (first(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const sortParam = first(params.sort) as Sort | undefined;
  const defaultSort: Sort = q ? "relevance" : "popular";
  let sort = sortParam && SORTS.includes(sortParam) ? sortParam : defaultSort;
  if (sort === "relevance" && !q) sort = "popular";

  let minPrice = shekelsToAgorot(params.min);
  let maxPrice = shekelsToAgorot(params.max);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const rating = Number(first(params.rating));
  const page = Number(first(params.page));

  return {
    q,
    brands: list(params.brand),
    shops: list(params.shop),
    categories: list(params.category),
    minPrice,
    maxPrice,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 4 ? rating : undefined,
    inStock: first(params.stock) === "1",
    deals: first(params.deals) === "1",
    sort,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Builds a query string for `query` with `changes` applied. Resets to page 1 unless `page` is changed. */
export function catalogHref(basePath: string, query: CatalogQuery, changes: Partial<CatalogQuery> = {}): string {
  const next = { ...query, page: 1, ...changes };
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.categories.length) sp.set("category", next.categories.join(","));
  if (next.brands.length) sp.set("brand", next.brands.join(","));
  if (next.shops.length) sp.set("shop", next.shops.join(","));
  if (next.minPrice !== undefined) sp.set("min", String(next.minPrice / 100));
  if (next.maxPrice !== undefined) sp.set("max", String(next.maxPrice / 100));
  if (next.rating) sp.set("rating", String(next.rating));
  if (next.inStock) sp.set("stock", "1");
  if (next.deals) sp.set("deals", "1");
  if (next.sort !== (next.q ? "relevance" : "popular")) sp.set("sort", next.sort);
  if (next.page > 1) sp.set("page", String(next.page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** True when anything beyond the default view is selected (used to noindex filtered pages). */
export function hasActiveFilters(query: CatalogQuery): boolean {
  return Boolean(
    query.q ||
      query.brands.length ||
      query.shops.length ||
      query.categories.length ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.rating ||
      query.inStock ||
      query.deals,
  );
}

/** Words for Postgres to_tsquery: letters/digits only, each as a prefix match. */
export function toPrefixTsQuery(q: string): string {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return words.map((w) => `${w}:*`).join(" & ");
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
