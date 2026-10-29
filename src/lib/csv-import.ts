import Papa from "papaparse";
import { parseMoney } from "@/lib/money";

// Bulk product upload. One row per variant; rows sharing a `handle` are one
// product. Product-level columns are read from the first row of each handle.
//
// handle,title,description,category,brand,status,option1_name,option1_value,
// option2_name,option2_value,option3_name,option3_value,sku,price,
// compare_at_price,stock,image_urls,specs
//
// price / compare_at_price are in shekels (129.90). image_urls and specs are
// separated by "|"; specs are "Key: Value".

export const CSV_COLUMNS = [
  "handle", "title", "description", "category", "brand", "status",
  "option1_name", "option1_value", "option2_name", "option2_value", "option3_name", "option3_value",
  "sku", "price", "compare_at_price", "stock", "image_urls", "specs",
] as const;

export const CSV_LIMITS = { bytes: 2 * 1024 * 1024, rows: 2000, products: 500 };

export type CsvRowError = { row: number; message: string; detail?: string };

export type CsvProduct = {
  handle: string;
  rows: number[];
  title: string;
  description: string;
  categorySlug: string;
  brandName: string;
  publish: boolean;
  images: { url: string; alt: string }[];
  specs: { key: string; value: string }[];
  variants: {
    attributes: Record<string, string>;
    sku: string;
    priceMinor: number;
    compareAtMinor: number | null;
    stock: number;
    isActive: boolean;
  }[];
};

export function parseProductCsv(text: string): { products: CsvProduct[]; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];
  if (text.length > CSV_LIMITS.bytes) return { products: [], errors: [{ row: 0, message: "csvTooLarge" }] };

  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const missing = ["handle", "sku", "price"].filter((c) => !parsed.meta.fields?.includes(c));
  if (missing.length) return { products: [], errors: [{ row: 1, message: "csvMissingColumns", detail: missing.join(", ") }] };
  if (parsed.data.length > CSV_LIMITS.rows) return { products: [], errors: [{ row: 0, message: "csvTooManyRows" }] };

  const products = new Map<string, CsvProduct>();
  parsed.data.forEach((raw, index) => {
    const row = index + 2; // 1-based, plus the header line
    const cell = (name: string) => (raw[name] ?? "").trim();
    const handle = cell("handle").toLowerCase();
    if (!handle) return errors.push({ row, message: "csvMissingHandle" });

    let product = products.get(handle);
    if (!product) {
      if (products.size >= CSV_LIMITS.products) return errors.push({ row, message: "csvTooManyProducts" });
      product = {
        handle,
        rows: [],
        title: cell("title"),
        description: cell("description"),
        categorySlug: cell("category").toLowerCase(),
        brandName: cell("brand"),
        publish: cell("status").toLowerCase() !== "draft",
        images: cell("image_urls")
          .split("|")
          .map((u) => u.trim())
          .filter(Boolean)
          .map((url) => ({ url, alt: cell("title") })),
        specs: cell("specs")
          .split("|")
          .map((pair) => pair.split(":"))
          .filter((parts) => parts.length >= 2)
          .map(([key, ...rest]) => ({ key: key.trim(), value: rest.join(":").trim() }))
          .filter((s) => s.key && s.value),
        variants: [],
      };
      products.set(handle, product);
    }
    product.rows.push(row);

    const attributes: Record<string, string> = {};
    for (const n of [1, 2, 3]) {
      const name = cell(`option${n}_name`) || (product.variants[0] ? Object.keys(product.variants[0].attributes)[n - 1] ?? "" : "");
      const value = cell(`option${n}_value`);
      if (name && value) attributes[name.toLowerCase()] = value;
    }

    const price = parseMoney(cell("price"));
    if (price === null) return errors.push({ row, message: "csvBadPrice" });
    const compareRaw = cell("compare_at_price");
    const compareAt = compareRaw ? parseMoney(compareRaw) : null;
    if (compareRaw && compareAt === null) return errors.push({ row, message: "csvBadPrice" });
    const stockRaw = cell("stock") || "0";
    if (!/^\d{1,6}$/.test(stockRaw)) return errors.push({ row, message: "csvBadStock" });

    product.variants.push({
      attributes,
      sku: cell("sku"),
      priceMinor: price,
      compareAtMinor: compareAt,
      stock: Number(stockRaw),
      isActive: true,
    });
  });

  return { products: [...products.values()], errors };
}

/** A ready-to-fill example file. */
export function csvTemplate(): string {
  const rows = [
    CSV_COLUMNS.join(","),
    'organic-tee,Organic cotton tee,"Soft tee made from 100% organic cotton.",men,Urban,active,size,S,color,White,,,TEE-S-WHITE,89.90,,12,,Material: Organic cotton|Fit: Regular',
    "organic-tee,,,,,,size,M,color,White,,,TEE-M-WHITE,89.90,,8,,",
    "organic-tee,,,,,,size,L,color,Black,,,TEE-L-BLACK,89.90,119.90,5,,",
  ];
  return `﻿${rows.join("\n")}\n`;
}
