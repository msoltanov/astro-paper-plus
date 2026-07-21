import { describe, it, expect } from "vitest";
import { resolveDefaultOgImagePath } from "@/utils/resolveDefaultOgImagePath";
import config from "@/config";

describe("resolveDefaultOgImagePath", () => {
  it("throws on path traversal with ..", () => {
    expect(() =>
      resolveDefaultOgImagePath({
        ...config,
        site: { ...config.site, ogImage: "../secret" },
      })
    ).toThrow();
  });

  it("throws on absolute path with /", () => {
    expect(() =>
      resolveDefaultOgImagePath({
        ...config,
        site: { ...config.site, ogImage: "/etc/passwd" },
      })
    ).toThrow();
  });

  it("throws on backslash path", () => {
    expect(() =>
      resolveDefaultOgImagePath({
        ...config,
        site: { ...config.site, ogImage: "windows\\path" },
      })
    ).toThrow();
  });
});

/**
 * Happy-path / dynamicOgImage matrix:
 *
 *  `getAssetPath` is mocked via vitest config; what we actually care
 *  about is the decision branch the helper takes based on
 *  `(config.features.dynamicOgImage, existsInPublic(filename))`.
 *
 *  `publicFiles = import.meta.glob("/public/*", { eager: false })` is
 *  populated at module load from the real `public/` directory.
 *  Concretely the only OG candidates in tree are `default-og.jpg`
 *  (the default `site.ogImage`) and `og.png` (the fallback).
 */
describe("resolveDefaultOgImagePath — happy path", () => {
  it("dynamicOgImage=true + existing filename → returns getAssetPath(filename)", () => {
    // `default-og.jpg` exists in `public/` for this project (verified at
    // setup time via `import.meta.glob('/public/*', { eager: false })`).
    expect(
      resolveDefaultOgImagePath({
        ...config,
        features: { ...config.features, dynamicOgImage: true },
        site: { ...config.site, ogImage: "default-og.jpg" },
      })
    ).toBe("/default-og.jpg");
  });

  it("dynamicOgImage=true + missing filename → falls back to /og.png", () => {
    expect(
      resolveDefaultOgImagePath({
        ...config,
        features: { ...config.features, dynamicOgImage: true },
        site: { ...config.site, ogImage: "does-not-exist.jpg" },
      })
    ).toBe("/og.png");
  });

  it("dynamicOgImage=false + existing filename → returns getAssetPath(filename)", () => {
    expect(
      resolveDefaultOgImagePath({
        ...config,
        features: { ...config.features, dynamicOgImage: false },
        site: { ...config.site, ogImage: "default-og.jpg" },
      })
    ).toBe("/default-og.jpg");
  });

  it("dynamicOgImage=false + missing filename → throws (no graceful fallback)", () => {
    expect(() =>
      resolveDefaultOgImagePath({
        ...config,
        features: { ...config.features, dynamicOgImage: false },
        site: { ...config.site, ogImage: "missing-file.jpg" },
      })
    ).toThrow();
  });

  it("preserves the 'no fallback' message shape when dynamicOgImage=false + missing", () => {
    // Lock down the error message so users searching the codebase for
    // a missing ogImage filename land on a useful string rather than a
    // cryptic "ENOENT" stack frame.
    expect(() =>
      resolveDefaultOgImagePath({
        ...config,
        features: { ...config.features, dynamicOgImage: false },
        site: { ...config.site, ogImage: "missing-file.jpg" },
      })
    ).toThrow(/missing public\/missing-file\.jpg/);
  });
});
