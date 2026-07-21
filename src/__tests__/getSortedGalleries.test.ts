import { describe, it, expect } from "vitest";
import { getSortedGalleries } from "@/utils/getSortedGalleries";
import type { CollectionEntry } from "astro:content";

function mockGallery(
  id: string,
  pubDatetime: string,
  opts?: {
    featured?: boolean;
    draft?: boolean;
    timezone?: string;
  }
): CollectionEntry<"galleries"> {
  return {
    id,
    data: {
      title: `Gallery ${id}`,
      pubDatetime,
      featured: opts?.featured ?? false,
      draft: opts?.draft ?? false,
      timezone: opts?.timezone ?? "UTC",
      images: [{ src: "test.jpg", alt: "test" }],
    },
    body: "",
    collection: "galleries" as const,
    render: async () => ({ Content: "", headings: [] }),
  } as unknown as CollectionEntry<"galleries">;
}

describe("getSortedGalleries", () => {
  it("places featured galleries first", () => {
    const entries = [
      mockGallery("a", "2024-01-01T00:00:00Z"),
      mockGallery("b", "2024-06-01T00:00:00Z", { featured: true }),
    ];
    const sorted = getSortedGalleries(entries);
    expect(sorted[0]!.id).toBe("b");
  });

  it("sorts by pubDatetime descending within same featured status", () => {
    const entries = [
      mockGallery("a", "2024-01-01T00:00:00Z"),
      mockGallery("b", "2024-06-01T00:00:00Z"),
    ];
    const sorted = getSortedGalleries(entries);
    expect(sorted[0]!.id).toBe("b");
  });

  it("returns empty array for empty input", () => {
    expect(getSortedGalleries([])).toEqual([]);
  });
});
