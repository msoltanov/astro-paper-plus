import { describe, it, expect, afterEach } from "vitest";
/**
 * `getGalleryPaths` mirrors `getProjectPaths` for the galleries
 * collection. It reads `astro:i18n` for `getRelativeLocaleUrl` — we rely
 * on the canonical mock in `src/__tests__/setup.ts` and additionally
 * mock `astro:content` plus the user config so the helper can be
 * unit-tested without booting an Astro dev server. See issues.md H8
 * for the mock/production alignment story.
 */

async function importWithMocks(opts: { base?: string }) {
  const { vi } = await import("vitest");
  vi.resetModules();
  vi.stubEnv("BASE_URL", opts.base ?? "/");
  return await import("@/utils/getGalleryPaths");
}

afterEach(async () => {
  const { vi } = await import("vitest");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getGallerySlug — locale-aware", () => {
  it("returns /<slug> for a top-level gallery", async () => {
    const { getGallerySlug } = await importWithMocks({});
    expect(getGallerySlug("sample-walk.mdx", undefined)).toBe("/sample-walk");
  });

  it("strips the locale folder from filePath-based segments", async () => {
    const { getGallerySlug } = await importWithMocks({});
    expect(
      getGallerySlug(
        "sample-walk.mdx",
        "src/content/galleries/tr/sample-walk.mdx"
      )
    ).toBe("/sample-walk");
  });

  it("strips locale folder from id when used as primary source", async () => {
    const { getGallerySlug } = await importWithMocks({});
    expect(getGallerySlug("tr/sample-walk.mdx", undefined)).toBe(
      "/sample-walk"
    );
  });

  it("keeps nested folder structure under the locale folder", async () => {
    const { getGallerySlug } = await importWithMocks({});
    expect(
      getGallerySlug(
        "sample-walk.mdx",
        "src/content/galleries/tr/trips/sample-walk.mdx"
      )
    ).toBe("/trips/sample-walk");
  });

  it("strips locale and private folder prefix together", async () => {
    const { getGallerySlug } = await importWithMocks({});
    expect(
      getGallerySlug(
        "scratch.mdx",
        "src/content/galleries/ru/_drafts/scratch.mdx"
      )
    ).toBe("/scratch");
  });
});

describe("getGalleryUrl — locale-aware", () => {
  it("returns /galleries/<slug>/ for the default locale", async () => {
    const { getGalleryUrl } = await importWithMocks({});
    expect(getGalleryUrl("sample-walk.mdx", undefined, "en")).toBe(
      "/galleries/sample-walk/"
    );
  });

  it("returns /<locale>/galleries/<slug>/ for non-default locales", async () => {
    const { getGalleryUrl } = await importWithMocks({});
    expect(getGalleryUrl("sample-walk.mdx", undefined, "tr")).toBe(
      "/tr/galleries/sample-walk/"
    );
    expect(getGalleryUrl("sample-walk.mdx", undefined, "ru")).toBe(
      "/ru/galleries/sample-walk/"
    );
  });

  it("uses the default locale when none is specified", async () => {
    const { getGalleryUrl } = await importWithMocks({});
    expect(getGalleryUrl("sample-walk.mdx", undefined)).toBe(
      "/galleries/sample-walk/"
    );
  });

  it("strips locale folder from filePath inside the slug", async () => {
    const { getGalleryUrl } = await importWithMocks({});
    expect(
      getGalleryUrl(
        "sample-walk.mdx",
        "src/content/galleries/tr/trips/sample-walk.mdx",
        "tr"
      )
    ).toBe("/tr/galleries/trips/sample-walk/");
  });
});
