import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import ar from "@/messages/ar.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations", () => {
  it("he and ar define exactly the same keys as en", () => {
    const expected = keys(en).sort();
    expect(keys(he).sort()).toEqual(expected);
    expect(keys(ar).sort()).toEqual(expected);
  });
});
