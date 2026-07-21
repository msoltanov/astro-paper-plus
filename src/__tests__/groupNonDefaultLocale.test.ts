import { describe, it, expect } from "vitest";
import { groupNonDefaultLocale } from "@/utils/groupNonDefaultLocale";
import type { CollectionEntry } from "astro:content";

const makePost = (id: string, filePath?: string): CollectionEntry<"posts"> =>
  ({ id, filePath }) as unknown as CollectionEntry<"posts">;

/**
 * `groupNonDefaultLocale` partitions a flat collection by locale in one pass.
 * The contract worth pinning:
 * - default-locale (`en`) entries are EXCLUDED from the result map
 *   (they have their own non-`[locale]/` route pair)
 * - unsupported / unknown locale segments are dropped
 * - empty input → empty map (no throw)
 */
describe("groupNonDefaultLocale", () => {
  it("partitions a mixed-locale collection, dropping the default locale", async () => {
    const all = [
      makePost("en/a.mdx", "src/content/posts/en/a.mdx"),
      makePost("ru/b.mdx", "src/content/posts/ru/b.mdx"),
      makePost("tr/c.mdx", "src/content/posts/tr/c.mdx"),
      makePost("tr/d.mdx", "src/content/posts/tr/d.mdx"),
    ];
    const map = await groupNonDefaultLocale(async () => all);
    expect(map.get("tr")).toHaveLength(2);
    expect(map.get("ru")).toHaveLength(1);
    // `en` is excluded — callers iterate the map directly without re-reading.
    expect(map.has("en")).toBe(false);
  });

  it("drops entries with unsupported / no locale prefix", async () => {
    const all = [
      makePost("fr/x.mdx", "src/content/posts/fr/x.mdx"), // unsupported
      makePost("legacy.mdx"), // no locale prefix → DEFAULT_LOCALE → dropped
      makePost("tr/y.mdx", "src/content/posts/tr/y.mdx"),
    ];
    const map = await groupNonDefaultLocale(async () => all);
    expect(map.get("tr")).toHaveLength(1);
    // Unsupported locales collapse to DEFAULT_LOCALE in getLocaleFromPost;
    // groupNonDefaultLocale then drops DEFAULT_LOCALE entirely.
    expect(map.has("fr")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("returns an empty map when given an empty collection", async () => {
    const map = await groupNonDefaultLocale(async () => []);
    expect(map.size).toBe(0);
  });

  it("returns an empty map when every entry is default-locale", async () => {
    const all = [
      makePost("a.mdx", "src/content/posts/en/a.mdx"),
      makePost("b.mdx", "src/content/posts/en/b.mdx"),
    ];
    const map = await groupNonDefaultLocale(async () => all);
    expect(map.size).toBe(0);
  });

  it("partitions nested filePaths under the same locale into one bucket", async () => {
    const all = [
      makePost("a.mdx", "src/content/posts/tr/a.mdx"),
      makePost("b.mdx", "src/content/posts/tr/examples/b.mdx"),
      makePost("c.mdx", "src/content/posts/tr/_drafts/c.mdx"),
    ];
    const map = await groupNonDefaultLocale(async () => all);
    expect(map.get("tr")).toHaveLength(3);
  });
});
