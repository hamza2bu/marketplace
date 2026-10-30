import { describe, expect, it } from "vitest";
import { isAllowedImageUrl, sniffImageType } from "@/lib/images";

describe("sniffImageType", () => {
  it("detects by magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([...Buffer.from("<svg onload=alert(1)>")]))).toBeNull();
  });
});

describe("isAllowedImageUrl", () => {
  it("allows our own image sources only", () => {
    expect(isAllowedImageUrl("/uploads/0123abcdef.jpg")).toBe(true);
    expect(isAllowedImageUrl("/placeholder/silk-scarf-1.svg")).toBe(true);
    expect(isAllowedImageUrl("https://res.cloudinary.com/acme/image/upload/v1/x.jpg", "acme")).toBe(true);
    expect(isAllowedImageUrl("https://res.cloudinary.com/other/image/upload/v1/x.jpg", "acme")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example/x.jpg", "acme")).toBe(false);
    expect(isAllowedImageUrl("/uploads/../../etc/passwd")).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
  });
});
