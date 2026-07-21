import { describe, it, expect } from "vitest";
import {
  normalizeSlugOverride,
  resolveContentSlug,
  slugSegmentsFromIdOrPath,
  deriveSlugFromFilePath,
  stripExtension,
  stripLeadingLocale,
  COLLECTION_DIRS,
} from "@/utils/contentSlug";

describe("normalizeSlugOverride", () => {
  it("returns null for non-strings", () => {
    expect(normalizeSlugOverride(undefined)).toBeNull();
    expect(normalizeSlugOverride(null)).toBeNull();
    expect(normalizeSlugOverride(42)).toBeNull();
    expect(normalizeSlugOverride({})).toBeNull();
  });

  it("returns null for empty / whitespace-only strings", () => {
    expect(normalizeSlugOverride("")).toBeNull();
    expect(normalizeSlugOverride("   ")).toBeNull();
  });

  it("rejects leading slashes (path-traversal guard style)", () => {
    expect(normalizeSlugOverride("/hello")).toBeNull();
    expect(normalizeSlugOverride(" /hello")).toBeNull();
  });

  it("rejects `..` segments", () => {
    expect(normalizeSlugOverride("../escape")).toBeNull();
    expect(normalizeSlugOverride("foo/../bar")).toBeNull();
  });

  it("rejects illegal characters", () => {
    expect(normalizeSlugOverride("hello world")).toBeNull();
    expect(normalizeSlugOverride("hi!")).toBeNull();
  });

  it("accepts nested slashes", () => {
    expect(normalizeSlugOverride("guides/e2e-testing")).toBe(
      "guides/e2e-testing"
    );
  });

  it("trims whitespace", () => {
    expect(normalizeSlugOverride("  hello  ")).toBe("hello");
  });
});

describe("resolveContentSlug", () => {
  it("uses the override when present", () => {
    expect(
      resolveContentSlug(
        "adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        "guides/adding-new-posts"
      )
    ).toBe("/guides/adding-new-posts");
  });

  it("falls back to filePath-based segments when override is missing", () => {
    expect(
      resolveContentSlug(
        "adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx"
      )
    ).toBe("/adding-new-post");
  });

  it("falls back to id when filePath is missing", () => {
    expect(resolveContentSlug("en/hello.mdx", undefined)).toBe("/hello");
  });

  it("falls back to id-only segments when no filePath AND no leading collection dir", () => {
    expect(resolveContentSlug("tr/site-rewrite.mdx", undefined)).toBe(
      "/site-rewrite"
    );
  });

  it("ignores a malformed override (path traversal safety net)", () => {
    expect(
      resolveContentSlug(
        "hello.mdx",
        "src/content/posts/en/hello.mdx",
        "../escape"
      )
    ).toBe("/hello");
  });

  it("preserves nested folder structure", () => {
    expect(
      resolveContentSlug(
        "portfolio.mdx",
        "src/content/posts/en/examples/portfolio.mdx"
      )
    ).toBe("/examples/portfolio");
  });

  it("handles bare collection-relative paths", () => {
    expect(
      resolveContentSlug("adding-new-post.mdx", "posts/en/adding-new-post.mdx")
    ).toBe("/adding-new-post");
  });
});

describe("slugSegmentsFromIdOrPath", () => {
  it("returns the slug override without leading slash", () => {
    expect(slugSegmentsFromIdOrPath("hello.mdx", undefined, "a/b")).toBe("a/b");
  });

  it("joins path-derived segments with /", () => {
    expect(
      slugSegmentsFromIdOrPath(
        "portfolio.mdx",
        "src/content/posts/en/examples/portfolio.mdx"
      )
    ).toBe("examples/portfolio");
  });
});

describe("deriveSlugFromFilePath", () => {
  it("returns { locale, segments } for full `src/content/...` paths", () => {
    expect(
      deriveSlugFromFilePath(
        "src/content/posts/en/adding-new-post.mdx",
        "ignored"
      )
    ).toEqual({ locale: "en", segments: ["adding-new-post"] });
  });

  it("returns { locale, segments } for bare collection-relative paths", () => {
    expect(deriveSlugFromFilePath("posts/en/foo.mdx", "ignored")).toEqual({
      locale: "en",
      segments: ["foo"],
    });
  });

  it("drops private folder segments", () => {
    expect(
      deriveSlugFromFilePath("posts/en/_releases/foo.mdx", "ignored")
    ).toEqual({ locale: "en", segments: ["foo"] });
  });

  it("falls back to id-only path when filePath is missing", () => {
    expect(deriveSlugFromFilePath(undefined, "tr/hello.mdx")).toEqual({
      locale: "tr",
      segments: ["hello"],
    });
  });

  it("falls back to id-only segments when no filePath AND no collection dir in id", () => {
    expect(deriveSlugFromFilePath(undefined, "tr/site-rewrite.mdx")).toEqual({
      locale: "tr",
      segments: ["site-rewrite"],
    });
  });

  it("preserves nested segments after locale-strip", () => {
    expect(
      deriveSlugFromFilePath(
        "src/content/projects/tr/examples/portfolio.mdx",
        "ignored"
      )
    ).toEqual({ locale: "tr", segments: ["examples", "portfolio"] });
  });

  it("falls back to id-only segments when no filePath AND no collection dir in id", () => {
    expect(deriveSlugFromFilePath(undefined, "tr/site-rewrite.mdx")).toEqual({
      locale: "tr",
      segments: ["site-rewrite"],
    });
  });

  it("returns id-only segments (no leading locale) when neither filePath nor locale prefix is present", () => {
    expect(deriveSlugFromFilePath(undefined, "not/a/content/path.mdx")).toEqual(
      { locale: "en", segments: ["not", "a", "content", "path"] }
    );
  });
});

describe("stripExtension / stripLeadingLocale / COLLECTION_DIRS", () => {
  it("stripExtension handles .md and .mdx", () => {
    expect(stripExtension("foo.md")).toBe("foo");
    expect(stripExtension("foo.mdx")).toBe("foo");
    expect(stripExtension("foo")).toBe("foo");
    expect(stripExtension("foo.MDX")).toBe("foo");
  });

  it("stripLeadingLocale drops a supported locale prefix", () => {
    expect(stripLeadingLocale("en/foo/bar")).toBe("foo/bar");
    expect(stripLeadingLocale("foo/bar")).toBe("foo/bar");
  });

  it("COLLECTION_DIRS lists the three locale-prefixed collections", () => {
    expect(COLLECTION_DIRS).toEqual(["posts", "projects", "galleries"]);
  });
});
