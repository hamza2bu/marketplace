import { describe, expect, it } from "vitest";
import { expandOptions } from "@/lib/variants";

describe("expandOptions", () => {
  it("returns one empty variant when there are no options", () => {
    expect(expandOptions()).toEqual([{}]);
  });

  it("builds every combination of the option axes", () => {
    expect(expandOptions({ size: ["S", "M"], color: ["black", "white"] })).toEqual([
      { size: "S", color: "black" },
      { size: "S", color: "white" },
      { size: "M", color: "black" },
      { size: "M", color: "white" },
    ]);
  });
});
