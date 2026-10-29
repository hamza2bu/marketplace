import { describe, expect, it } from "vitest";
import { catalogHref, escapeLike, hasActiveFilters, parseCatalogQuery, toPrefixTsQuery } from "@/lib/catalog-query";

describe("parseCatalogQuery", () => {
  it("uses sensible defaults", () => {
    expect(parseCatalogQuery({})).toEqual({
      q: "",
      brands: [],
      shops: [],
      categories: [],
      minPrice: undefined,
      maxPrice: undefined,
      rating: undefined,
      inStock: false,
      deals: false,
      sort: "popular",
      page: 1,
    });
  });

  it("defaults to relevance when there is a query, and never sorts by relevance without one", () => {
    expect(parseCatalogQuery({ q: "אוזניות" }).sort).toBe("relevance");
    expect(parseCatalogQuery({ sort: "relevance" }).sort).toBe("popular");
  });

  it("reads repeated and comma-separated lists, dropping invalid slugs", () => {
    const query = parseCatalogQuery({ brand: ["soundmax", "voltpro,clickr"], shop: "techzone,<script>" });
    expect(query.brands).toEqual(["soundmax", "voltpro", "clickr"]);
    expect(query.shops).toEqual(["techzone"]);
  });

  it("converts shekel prices to agorot and swaps a reversed range", () => {
    expect(parseCatalogQuery({ min: "500", max: "99.9" })).toMatchObject({ minPrice: 9990, maxPrice: 50000 });
    expect(parseCatalogQuery({ min: "", max: "abc" })).toMatchObject({ minPrice: undefined, maxPrice: undefined });
  });

  it("clamps page, rating and query length", () => {
    expect(parseCatalogQuery({ page: "-3" }).page).toBe(1);
    expect(parseCatalogQuery({ page: "99999" }).page).toBe(500);
    expect(parseCatalogQuery({ rating: "7" }).rating).toBeUndefined();
    expect(parseCatalogQuery({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("catalogHref", () => {
  const base = parseCatalogQuery({ q: "cable", brand: "voltpro", page: "3" });

  it("round-trips through parseCatalogQuery", () => {
    const href = catalogHref("/search", base, { page: 3 });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseCatalogQuery(params)).toEqual(base);
  });

  it("resets to page 1 when filters change and omits default sort", () => {
    expect(catalogHref("/search", base, { inStock: true })).toBe("/search?q=cable&brand=voltpro&stock=1");
  });

  it("returns the bare path when nothing is set", () => {
    expect(catalogHref("/c/audio", parseCatalogQuery({}))).toBe("/c/audio");
  });
});

describe("search helpers", () => {
  it("builds a prefix tsquery from letters and digits only", () => {
    expect(toPrefixTsQuery("מטען 65W & | !")).toBe("מטען:* & 65w:*");
    expect(toPrefixTsQuery("&|!():*")).toBe("");
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("detects active filters", () => {
    expect(hasActiveFilters(parseCatalogQuery({ sort: "newest", page: "2" }))).toBe(false);
    expect(hasActiveFilters(parseCatalogQuery({ stock: "1" }))).toBe(true);
  });
});
