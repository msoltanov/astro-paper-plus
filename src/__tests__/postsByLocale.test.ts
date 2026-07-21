import { describe, it, expect } from "vitest";
import { postsByLocale } from "@/utils/postsByLocale";
import type { CollectionEntry } from "astro:content";

/**
 * `postsByLocale` accepts a full `CollectionEntry<"posts">` but only
 * reads `id` + `filePath`. For tests we cast a minimal stub through
 * `unknown` so the predicate's full type matches without filling in
 * unrelated fields.
 */
const makePost = (id: string, filePath?: string): CollectionEntry<"posts"> =>
  ({
    id,
    filePath,
  }) as unknown as CollectionEntry<"posts">;

/**
 * `postsByLocale` is a thin adapter over `getLocaleFromPost`. The
 * contract worth pinning:
 * - matches when the detected locale equals the requested locale
 * - never throws on missing `filePath` (id-only entries are valid)
 * - returns a predicate (not the entry), so callers can chain it into
 *   `getCollection(name, postsByLocale("tr"))` directly
 */
describe("postsByLocale", () => {
  it("matches a post whose filePath-derived locale equals the requested locale", () => {
    const predicate = postsByLocale("tr");
    expect(
      predicate(makePost("hello.mdx", "src/content/posts/tr/hello.mdx"))
    ).toBe(true);
    expect(
      predicate(makePost("nested.mdx", "src/content/posts/tr/nested/hello.mdx"))
    ).toBe(true);
  });

  it("does not match a post from a different locale", () => {
    const predicate = postsByLocale("tr");
    expect(
      predicate(makePost("hello.mdx", "src/content/posts/ru/hello.mdx"))
    ).toBe(false);
    expect(
      predicate(makePost("hello.mdx", "src/content/posts/en/hello.mdx"))
    ).toBe(false);
  });

  it("falls back to id when filePath is missing", () => {
    const predicate = postsByLocale("ru");
    expect(predicate(makePost("ru/hello.mdx"))).toBe(true);
    expect(predicate(makePost("ru/nested/hello.mdx"))).toBe(true);
    expect(predicate(makePost("tr/hello.mdx"))).toBe(false);
  });

  it("returns a predicate, not an entry — re-usable across calls", () => {
    const predicate = postsByLocale("en");
    const entry = makePost("hello.mdx", "src/content/posts/en/hello.mdx");
    expect(predicate(entry)).toBe(predicate(entry));
  });

  it("returns the same boolean for default-locale entries when given 'en'", () => {
    const predicate = postsByLocale("en");
    expect(predicate(makePost("legacy.mdx"))).toBe(true);
  });

  it("does not match a 'fr' (unsupported locale) entry against 'tr'", () => {
    const predicate = postsByLocale("tr");
    expect(predicate(makePost("fr/hello.mdx"))).toBe(false);
  });
});
