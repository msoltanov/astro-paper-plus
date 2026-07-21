import { describe, it, expect, afterEach } from "vitest";
/**
 * `getProjectPaths` mirrors `getPostPaths` for the projects collection.
 * It reads `astro:i18n` for `getRelativeLocaleUrl` — we rely on the
 * canonical mock in `src/__tests__/setup.ts` and additionally mock
 * `astro:content` plus the user config so the helper can be
 * unit-tested. See issues.md H8 for the mock/production alignment story.
 */

async function importWithMocks(opts: { base?: string }) {
  const { vi } = await import("vitest");
  vi.resetModules();
  vi.stubEnv("BASE_URL", opts.base ?? "/");
  return await import("@/utils/getProjectPaths");
}

afterEach(async () => {
  const { vi } = await import("vitest");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getProjectSlug — locale-aware", () => {
  it("returns /<slug> for a top-level project", async () => {
    const { getProjectSlug } = await importWithMocks({});
    expect(getProjectSlug("site-rewrite.mdx", undefined)).toBe("/site-rewrite");
  });

  it("strips the locale folder from filePath-based segments", async () => {
    const { getProjectSlug } = await importWithMocks({});
    expect(
      getProjectSlug(
        "site-rewrite.mdx",
        "src/content/projects/tr/site-rewrite.mdx"
      )
    ).toBe("/site-rewrite");
  });

  it("strips locale folder from id when used as primary source", async () => {
    const { getProjectSlug } = await importWithMocks({});
    expect(getProjectSlug("tr/site-rewrite.mdx", undefined)).toBe(
      "/site-rewrite"
    );
  });

  it("keeps nested folder structure under the locale folder", async () => {
    const { getProjectSlug } = await importWithMocks({});
    expect(
      getProjectSlug(
        "site-rewrite.mdx",
        "src/content/projects/tr/web/site-rewrite.mdx"
      )
    ).toBe("/web/site-rewrite");
  });

  it("strips locale and private folder prefix together", async () => {
    const { getProjectSlug } = await importWithMocks({});
    expect(
      getProjectSlug(
        "scratch.mdx",
        "src/content/projects/ru/_drafts/scratch.mdx"
      )
    ).toBe("/scratch");
  });
});

describe("getProjectUrl — locale-aware", () => {
  it("returns /projects/<slug>/ for the default locale", async () => {
    const { getProjectUrl } = await importWithMocks({});
    expect(getProjectUrl("site-rewrite.mdx", undefined, "en")).toBe(
      "/projects/site-rewrite/"
    );
  });

  it("returns /<locale>/projects/<slug>/ for non-default locales", async () => {
    const { getProjectUrl } = await importWithMocks({});
    expect(getProjectUrl("site-rewrite.mdx", undefined, "tr")).toBe(
      "/tr/projects/site-rewrite/"
    );
    expect(getProjectUrl("site-rewrite.mdx", undefined, "ru")).toBe(
      "/ru/projects/site-rewrite/"
    );
  });

  it("uses the default locale when none is specified", async () => {
    const { getProjectUrl } = await importWithMocks({});
    expect(getProjectUrl("site-rewrite.mdx", undefined)).toBe(
      "/projects/site-rewrite/"
    );
  });

  it("strips locale folder from filePath inside the slug", async () => {
    const { getProjectUrl } = await importWithMocks({});
    expect(
      getProjectUrl(
        "site-rewrite.mdx",
        "src/content/projects/tr/web/site-rewrite.mdx",
        "tr"
      )
    ).toBe("/tr/projects/web/site-rewrite/");
  });
});
