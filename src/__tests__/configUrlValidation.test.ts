import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `assertSafeUrl` runs at `src/config.ts` module-load time, so
 * regressions here blow up every consumer that transitively imports
 * the config. The previous ordering ran
 * `normalizeUrlForValidation(url)` (which calls `.replace`) BEFORE
 * the `typeof url !== "string"` guard — a misconfigured
 * `socials: [{ name: "x", url: undefined }]` then crashed with
 * `Cannot read properties of undefined (reading 'replace')`, masking
 * the actual "this field is invalid" intent with a TypeError.
 *
 * We test the dynamic-import path because `assertSafeUrl` is
 * module-scope and doesn't expose a stand-alone entry point. Each
 * case stacks a `@/astro-paper.config` mock that contains a malformed
 * `socials[].url`, then asserts the import rejection message.
 */

const baseSite = {
  url: "https://example.com",
  title: "T",
  description: "D",
  author: "A",
  ogImage: "default-og.jpg",
  lang: "en",
  timezone: "UTC",
  dir: "ltr",
};

const basePosts = {
  perPage: 4,
  perIndex: 4,
};

const baseContent = {
  scheduledPostMargin: 15 * 60 * 1000,
};

const baseFeatures = {
  lightAndDarkMode: true,
  dynamicOgImage: true,
  showBackButton: true,
  editPost: { enabled: false },
  search: "pagefind",
};

afterEach(() => {
  vi.doUnmock("@/astro-paper.config");
  vi.resetModules();
});

function mockConfigWithSocialUrl(
  url: unknown,
  site: typeof baseSite = baseSite
): void {
  vi.doMock("@/astro-paper.config", () => ({
    default: {
      site,

      posts: basePosts,
      content: baseContent,
      features: baseFeatures,
      socials: [{ name: "broken-social", url }],
      shareLinks: [],
    },
  }));
}

describe("src/config.ts — assertSafeUrl typeof guard", () => {
  it("rejects a non-string social.url with a validation error (not a TypeError)", async () => {
    mockConfigWithSocialUrl(undefined);
    await expect(import("@/config")).rejects.toThrow(
      /social "broken-social" has an unsafe or missing URL/
    );
  });

  it("rejects null with a validation error (not a TypeError)", async () => {
    mockConfigWithSocialUrl(null);
    await expect(import("@/config")).rejects.toThrow(
      /social "broken-social" has an unsafe or missing URL/
    );
  });

  it("rejects a numeric url with a validation error (not a TypeError)", async () => {
    mockConfigWithSocialUrl(42);
    await expect(import("@/config")).rejects.toThrow(
      /social "broken-social" has an unsafe or missing URL/
    );
  });

  it("rejects an empty-string url with a validation error", async () => {
    mockConfigWithSocialUrl("");
    await expect(import("@/config")).rejects.toThrow(
      /social "broken-social" has an unsafe or missing URL/
    );
  });

  it("rejects an unsafe-scheme url with the scheme-specific message", async () => {
    mockConfigWithSocialUrl("javascript:alert(1)");
    await expect(import("@/config")).rejects.toThrow(
      /unsafe URL "javascript:alert\(1\)"/
    );
  });

  it("rejects placeholder labels embedded in subdomains", async () => {
    mockConfigWithSocialUrl("https://your-handle.attacker.com/profile");
    await expect(import("@/config")).rejects.toThrow(/placeholder hostname/);
  });

  it("preserves a trailing slash on a site URL with a path", async () => {
    const site = { ...baseSite, url: "https://example.com/blog/" };
    mockConfigWithSocialUrl("https://github.com/example", site);
    const module = await import("@/config");
    expect(module.default.site.url).toBe("https://example.com/blog/");
  });

  it("accepts a valid http(s) url (control case)", async () => {
    mockConfigWithSocialUrl("https://github.com/example");
    await expect(import("@/config")).resolves.toBeDefined();
  });
});
