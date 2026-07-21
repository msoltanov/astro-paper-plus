import { describe, it, expect, afterEach } from "vitest";
/**
 * getPostPaths reads `astro:i18n` (which Astro only provides at build time),
 * so in vitest we rely on the global mock in `src/__tests__/setup.ts`. The
 * global mock mirrors Astro's runtime `getRelativeLocaleUrl` (see issues.md
 * H8): directory-style paths come back with a trailing slash.
 *
 * URL-shape policy: trailing slash is intentional and matches what the site
 * ships in production (sitemap, RSS, internal nav). Astro's `trailingSlash`
 * setting is left at its default (`'ignore'`), and the canonical mock in
 * setup.ts reflects that.
 *
 * The contract under test (post-i18n):
 * - getPostSlug strips the leading locale folder so the URL stays /posts/<slug>
 * - getPostUrl applies the locale prefix via the (mocked) astro:i18n helper.
 */

async function importWithMocks(opts: { base?: string }) {
  const { vi } = await import("vitest");
  vi.resetModules();
  vi.stubEnv("BASE_URL", opts.base ?? "/");
  return await import("@/utils/getPostPaths");
}

afterEach(async () => {
  const { vi } = await import("vitest");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getPostSlug — locale-aware", () => {
  it("returns /<slug> for a top-level post", async () => {
    const { getPostSlug } = await importWithMocks({});
    expect(getPostSlug("hello.mdx", undefined)).toBe("/hello");
  });

  it("strips the locale folder from filePath-based segments", async () => {
    const { getPostSlug } = await importWithMocks({});
    // File: src/content/posts/tr/hello.mdx → segments include "tr" which we strip
    expect(getPostSlug("hello.mdx", "src/content/posts/tr/hello.mdx")).toBe(
      "/hello"
    );
  });

  it("strips locale folder from id when used as primary source", async () => {
    const { getPostSlug } = await importWithMocks({});
    // The id passed in may be 'tr/hello' if the loader chose that form
    expect(getPostSlug("tr/hello.mdx", undefined)).toBe("/hello");
  });

  it("keeps nested folder structure (for non-locale folders)", async () => {
    const { getPostSlug } = await importWithMocks({});
    // src/content/posts/tr/examples/portfolio.mdx → /examples/portfolio
    expect(
      getPostSlug(
        "portfolio.mdx",
        "src/content/posts/tr/examples/portfolio.mdx"
      )
    ).toBe("/examples/portfolio");
  });

  it("strips locale and private folder prefix together", async () => {
    const { getPostSlug } = await importWithMocks({});
    // Per astro-paper convention, folders prefixed with `_` are EXCLUDED
    // from routing. So `en/_releases/astro-paper-6.md` → `/astro-paper-6`.
    expect(
      getPostSlug(
        "astro-paper-6.md",
        "src/content/posts/en/_releases/astro-paper-6.md"
      )
    ).toBe("/astro-paper-6");
  });

  it("honors a valid frontmatter slug override (single segment)", async () => {
    const { getPostSlug } = await importWithMocks({});
    expect(
      getPostSlug(
        "adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        "guides/adding-new-posts"
      )
    ).toBe("/guides/adding-new-posts");
  });

  it("rejects a malformed slug override (leading slash, `..`, or illegal chars) and falls back to filename", async () => {
    const { getPostSlug } = await importWithMocks({});
    // Leading slash — rejected, falls back.
    expect(
      getPostSlug(
        "hello.mdx",
        "src/content/posts/tr/hello.mdx",
        "/hello-from-override"
      )
    ).toBe("/hello");
    // `..` — rejected, falls back (path traversal guard).
    expect(
      getPostSlug("hello.mdx", "src/content/posts/en/hello.mdx", "../escape")
    ).toBe("/hello");
    // Illegal characters — rejected, falls back.
    expect(
      getPostSlug(
        "hello.mdx",
        "src/content/posts/en/hello.mdx",
        "hello world.mdx"
      )
    ).toBe("/hello");
  });
});

describe("getPostUrl — locale-aware", () => {
  it("returns /posts/<slug>/ for the default locale", async () => {
    const { getPostUrl } = await importWithMocks({});
    // Use a slug-based post (no filePath needed when id has no locale prefix)
    expect(getPostUrl("hello.mdx", undefined, "en")).toBe("/posts/hello/");
  });

  it("returns /<locale>/posts/<slug>/ for non-default locales", async () => {
    const { getPostUrl } = await importWithMocks({});
    expect(getPostUrl("hello.mdx", undefined, "tr")).toBe("/tr/posts/hello/");
    expect(getPostUrl("hello.mdx", undefined, "ru")).toBe("/ru/posts/hello/");
  });

  it("uses default locale when none is specified", async () => {
    const { getPostUrl } = await importWithMocks({});
    expect(getPostUrl("hello.mdx", undefined)).toBe("/posts/hello/");
  });

  it("strips locale folder from filePath inside the slug", async () => {
    const { getPostUrl } = await importWithMocks({});
    expect(
      getPostUrl("hello.mdx", "src/content/posts/tr/examples/hello.mdx", "tr")
    ).toBe("/tr/posts/examples/hello/");
  });
});
