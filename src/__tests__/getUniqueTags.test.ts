import { describe, it, expect } from "vitest";
import { getUniqueTags } from "@/utils/getUniqueTags";
import slugify from "slugify";

const postsWithTags = (posts: { tags: string[] }[]) =>
  posts.map(p => ({ data: p })) as unknown as Parameters<
    typeof getUniqueTags
  >[0];

describe("getUniqueTags", () => {
  it("returns empty array for empty post list", () => {
    expect(getUniqueTags([])).toEqual([]);
  });

  it("collects tags from a single post", () => {
    const posts = postsWithTags([{ tags: ["JavaScript", "Astro"] }]);
    const result = getUniqueTags(posts);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.tagName)).toEqual(["Astro", "JavaScript"]);
  });

  it("deduplicates tags across posts by slug", () => {
    const posts = postsWithTags([
      { tags: ["Astro"] },
      { tags: ["Astro"] },
      { tags: ["astro"] },
    ]);
    const result = getUniqueTags(posts);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("astro");
  });

  it("sorts alphabetically by tagName with case-insensitive ordering", () => {
    const posts = postsWithTags([{ tags: ["Zero", "alpha", "Beta"] }]);
    const result = getUniqueTags(posts);
    expect(result.map(t => t.tagName)).toEqual(["alpha", "Beta", "Zero"]);
  });

  it("preserves original casing in tagName while using slug case in tag", () => {
    const posts = postsWithTags([{ tags: ["JavaScript"] }]);
    const result = getUniqueTags(posts);
    expect(result[0].tag).toBe(slugify.default("JavaScript", { lower: true }));
    expect(result[0].tagName).toBe("JavaScript");
  });

  it("handles posts with empty tags arrays", () => {
    const posts = postsWithTags([{ tags: ["CSS"] }, { tags: [] }]);
    const result = getUniqueTags(posts);
    expect(result).toHaveLength(1);
    expect(result[0].tagName).toBe("CSS");
  });

  it("pins localeCompare ordering across Node versions (no locale-specific drift)", () => {
    const posts = postsWithTags([{ tags: ["aaa", "BBB", "ccc", "111"] }]);
    const result = getUniqueTags(posts);
    expect(result.map(t => t.tagName)).toEqual(["111", "aaa", "BBB", "ccc"]);
  });
});
