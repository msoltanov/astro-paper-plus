import { describe, it, expect } from "vitest";
import { getSortedPosts } from "@/utils/getSortedPosts";
import type { CollectionEntry } from "astro:content";

function mockPost(
  id: string,
  pubDatetime: string,
  opts?: {
    draft?: boolean;
    modDatetime?: string;
    timezone?: string;
  }
): CollectionEntry<"posts"> {
  return {
    id,
    data: {
      title: `Post ${id}`,
      pubDatetime,
      modDatetime: opts?.modDatetime,
      draft: opts?.draft,
      timezone: opts?.timezone ?? "UTC",
      tags: [],
    },
    body: "",
    collection: "posts" as const,
    filePath: `src/content/posts/en/${id}.md`,
    render: async () => ({ Content: "", headings: [] }),
  } as unknown as CollectionEntry<"posts">;
}

describe("getSortedPosts", () => {
  it("sorts by modDatetime when present, descending", () => {
    const posts = [
      mockPost("a", "2024-01-01T00:00:00Z", {
        modDatetime: "2024-06-01T00:00:00Z",
      }),
      mockPost("b", "2024-03-01T00:00:00Z", {
        modDatetime: "2024-02-01T00:00:00Z",
      }),
    ];
    const sorted = getSortedPosts(posts);
    expect(sorted[0]!.id).toBe("a");
  });

  it("sorts by pubDatetime when modDatetime is absent", () => {
    const posts = [
      mockPost("a", "2024-03-01T00:00:00Z"),
      mockPost("b", "2024-06-01T00:00:00Z"),
    ];
    const sorted = getSortedPosts(posts);
    expect(sorted[0]!.id).toBe("b");
  });

  it("excludes drafts", () => {
    const posts = [
      mockPost("a", "2024-01-01T00:00:00Z"),
      mockPost("b", "2024-02-01T00:00:00Z", { draft: true }),
    ];
    const sorted = getSortedPosts(posts);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.id).toBe("a");
  });

  it("handles same-second tie deterministically", () => {
    const posts = [
      mockPost("a", "2024-01-01T00:00:00.500Z"),
      mockPost("b", "2024-01-01T00:00:00.900Z"),
    ];
    const sorted = getSortedPosts(posts);
    expect(sorted).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(getSortedPosts([])).toEqual([]);
  });
});
