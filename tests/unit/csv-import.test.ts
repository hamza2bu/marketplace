import { describe, expect, it } from "vitest";
import { csvTemplate, parseProductCsv } from "@/lib/csv-import";

describe("parseProductCsv", () => {
  it("groups variant rows into products and reads product fields from the first row", () => {
    const { products, errors } = parseProductCsv(csvTemplate());
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    const [p] = products;
    expect(p).toMatchObject({ handle: "organic-tee", title: "Organic cotton tee", categorySlug: "men", brandName: "Urban", publish: true, rows: [2, 3, 4] });
    expect(p.specs).toEqual([
      { key: "Material", value: "Organic cotton" },
      { key: "Fit", value: "Regular" },
    ]);
    expect(p.variants.map((v) => [v.sku, v.attributes, v.priceMinor, v.compareAtMinor, v.stock])).toEqual([
      ["TEE-S-WHITE", { size: "S", color: "White" }, 8990, null, 12],
      ["TEE-M-WHITE", { size: "M", color: "White" }, 8990, null, 8],
      ["TEE-L-BLACK", { size: "L", color: "Black" }, 8990, 11990, 5],
    ]);
  });

  it("reports bad rows with their line numbers", () => {
    const csv = ["handle,sku,price,stock", "a,A1,12.5,3", "a,A2,abc,1", "b,B1,10,-4", ",C1,10,1"].join("\n");
    const { products, errors } = parseProductCsv(csv);
    expect(errors).toEqual([
      { row: 3, message: "csvBadPrice" },
      { row: 4, message: "csvBadStock" },
      { row: 5, message: "csvMissingHandle" },
    ]);
    expect(products.map((p) => p.handle)).toEqual(["a", "b"]);
  });

  it("requires the key columns", () => {
    expect(parseProductCsv("title,price\nx,1").errors[0]).toMatchObject({ message: "csvMissingColumns", detail: "handle, sku" });
  });

  it("handles quoted commas, Hebrew and a byte-order mark", () => {
    const { products } = parseProductCsv('﻿handle,title,sku,price\nscarf,"צעיף, משי",S1,"119.90"\n');
    expect(products[0].title).toBe("צעיף, משי");
    expect(products[0].variants[0].priceMinor).toBe(11990);
  });
});
