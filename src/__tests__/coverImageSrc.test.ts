import { describe, it, expect } from "vitest";
import { coverImageSrc } from "@/utils/coverImageSrc";

const mockImage = { src: "/_astro/sunset.abc123.webp" } as ImageMetadata;

describe("coverImageSrc", () => {
  it("returns undefined for undefined input", () => {
    expect(coverImageSrc(undefined)).toBeUndefined();
  });

  it("returns the string as-is for a plain string", () => {
    expect(coverImageSrc("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg"
    );
  });

  it("returns .src for an ImageMetadata object", () => {
    expect(coverImageSrc(mockImage)).toBe("/_astro/sunset.abc123.webp");
  });
});
