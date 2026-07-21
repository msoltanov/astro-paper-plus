import { describe, expect, it } from "vitest";
import { nestToc, type TocItem } from "../utils/toc";

describe("nestToc", () => {
  it("returns an empty tree for an empty input", () => {
    expect(nestToc([])).toEqual<TocItem[]>([]);
  });

  it("puts a single heading at the root", () => {
    const result = nestToc([{ depth: 2, slug: "a", text: "A" }]);
    expect(result).toEqual<TocItem[]>([
      { depth: 2, slug: "a", text: "A", children: [] },
    ]);
  });

  it("keeps sibling h2s flat at the root", () => {
    const result = nestToc([
      { depth: 2, slug: "a", text: "A" },
      { depth: 2, slug: "b", text: "B" },
      { depth: 2, slug: "c", text: "C" },
    ]);
    expect(result.map(n => n.slug)).toEqual(["a", "b", "c"]);
    expect(result.every(n => n.children.length === 0)).toBe(true);
  });

  it("nests an h3 under the previous h2", () => {
    const result = nestToc([
      { depth: 2, slug: "a", text: "A" },
      { depth: 3, slug: "a-1", text: "A.1" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("a");
    expect(result[0].children).toEqual<TocItem[]>([
      { depth: 3, slug: "a-1", text: "A.1", children: [] },
    ]);
  });

  it("re-parents h3s when a new h2 appears between them", () => {
    const result = nestToc([
      { depth: 2, slug: "a", text: "A" },
      { depth: 3, slug: "a-1", text: "A.1" },
      { depth: 2, slug: "b", text: "B" },
      { depth: 3, slug: "b-1", text: "B.1" },
    ]);
    expect(result.map(n => n.slug)).toEqual(["a", "b"]);
    expect(result[0].children.map(c => c.slug)).toEqual(["a-1"]);
    expect(result[1].children.map(c => c.slug)).toEqual(["b-1"]);
  });

  it("handles the canonical mixed example", () => {
    const result = nestToc([
      { depth: 2, slug: "intro", text: "Intro" },
      { depth: 2, slug: "install", text: "Install" },
      { depth: 3, slug: "prereqs", text: "Prereqs" },
      { depth: 3, slug: "first-run", text: "First run" },
      { depth: 2, slug: "config", text: "Config" },
      { depth: 2, slug: "troubleshoot", text: "Troubleshoot" },
    ]);
    expect(result.map(n => n.slug)).toEqual([
      "intro",
      "install",
      "config",
      "troubleshoot",
    ]);
    expect(result[1].children.map(c => c.slug)).toEqual([
      "prereqs",
      "first-run",
    ]);
    expect(result[2].children).toEqual([]);
    expect(result[3].children).toEqual([]);
  });

  it("preserves order of children", () => {
    const result = nestToc([
      { depth: 2, slug: "x", text: "X" },
      { depth: 3, slug: "x-3", text: "X.3" },
      { depth: 3, slug: "x-1", text: "X.1" },
      { depth: 3, slug: "x-2", text: "X.2" },
    ]);
    expect(result[0].children.map(c => c.slug)).toEqual(["x-3", "x-1", "x-2"]);
  });

  it("collapses a sibling h3 after a parent h2 closes", () => {
    // Simulates: ## A / ### A.1 / ## B / ### B.1 - each h3 is a child
    // of its preceding h2, never a sibling of the previous h3.
    const result = nestToc([
      { depth: 2, slug: "a", text: "A" },
      { depth: 3, slug: "a-1", text: "A.1" },
      { depth: 2, slug: "b", text: "B" },
      { depth: 3, slug: "b-1", text: "B.1" },
      { depth: 3, slug: "b-2", text: "B.2" },
    ]);
    expect(result[1].children.map(c => c.slug)).toEqual(["b-1", "b-2"]);
  });
});
