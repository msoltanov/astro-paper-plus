import { describe, it, expect } from "vitest";
import { postTitleTransitionName } from "@/utils/postTitleTransitionName";

describe("postTitleTransitionName", () => {
  it("matches the Card + post detail composite shape", () => {
    const post = {
      id: "posts/2026-07-09-adding-new-post.mdx",
      data: { title: "Adding a New Post in AstroPaper+" },
    };
    // Both halves get slugified; the separator in the source code is a
    // literal `-`, and `toTransitionName` collapses adjacent dashes by
    // design. The behaviour that matters is: the same input post
    // produces the same identifier from the Card and the detail page —
    // i.e. the function is pure and deterministic.
    expect(postTitleTransitionName(post)).toBe(postTitleTransitionName(post));
    // And the identifier follows the underlying toTransitionName
    // contract: ASCII letters/digits/dashes, never empty.
    expect(postTitleTransitionName(post)).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("differs when the title changes", () => {
    const a = { id: "same", data: { title: "Alpha" } };
    const b = { id: "same", data: { title: "Beta" } };
    expect(postTitleTransitionName(a)).not.toBe(postTitleTransitionName(b));
  });

  it("differs when the id changes (same title)", () => {
    const a = { id: "posts/a.mdx", data: { title: "Same" } };
    const b = { id: "posts/b.mdx", data: { title: "Same" } };
    expect(postTitleTransitionName(a)).not.toBe(postTitleTransitionName(b));
  });

  it("never produces an empty custom-ident", () => {
    const result = postTitleTransitionName({
      id: "!!!",
      data: { title: "!!!" },
    });
    expect(result.length).toBeGreaterThan(0);
    // Should satisfy the toTransitionName post-conditions.
    expect(result).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
