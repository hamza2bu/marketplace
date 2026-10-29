import { describe, expect, it } from "vitest";
import { ancestry, childrenOf, descendantIds, type CategoryNode } from "@/lib/category-tree";

const node = (id: string, parentId: string | null, sortOrder = 0): CategoryNode => ({
  id,
  slug: id,
  parentId,
  name: { en: id },
  imageUrl: null,
  sortOrder,
});

const tree = [node("electronics", null), node("audio", "electronics", 1), node("phones", "electronics", 0), node("earbuds", "audio"), node("fashion", null)];

describe("category tree", () => {
  it("collects all descendants", () => {
    expect(descendantIds(tree, "electronics").sort()).toEqual(["audio", "earbuds", "electronics", "phones"]);
    expect(descendantIds(tree, "fashion")).toEqual(["fashion"]);
  });

  it("returns the path from the root", () => {
    expect(ancestry(tree, "earbuds").map((c) => c.id)).toEqual(["electronics", "audio", "earbuds"]);
  });

  it("lists children in sort order", () => {
    expect(childrenOf(tree, "electronics").map((c) => c.id)).toEqual(["phones", "audio"]);
  });
});
