import { describe, it, expect } from "vitest";
import type { CollectionEntry } from "astro:content";
import { extractExcerpt, postDescription } from "@/utils/postDescription";

/**
 * `extractExcerpt` is the cheap Markdown → plain-text inner loop, so most
 * tests target it directly. `postDescription` is a thin wrapper — one test
 * is enough to confirm the explicit-override-and-fallback contract.
 */

// Helper: cast a {data, body} pair as a CollectionEntry so we can exercise
// `postDescription` without booting `astro:content`. The signature we care
// about (data + body) is what the helper actually reads.
function fakePost(
  data: { description?: string | undefined },
  body: string
): CollectionEntry<"posts"> {
  return {
    data: data as CollectionEntry<"posts">["data"],
    body,
  } as unknown as CollectionEntry<"posts">;
}

describe("extractExcerpt — marker detection", () => {
  it("returns undefined when there is no marker", () => {
    expect(
      extractExcerpt("Hello world.\nNo marker in this body.")
    ).toBeUndefined();
  });

  it("extracts content before the marker", () => {
    const md = [
      "First paragraph.",
      "",
      "Second paragraph.",
      "",
      "<!-- more -->",
      "",
      "Deep dive starts here.",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("First paragraph. Second paragraph.");
  });

  it("accepts the marker without spaces (Jekyll style)", () => {
    const md = ["Teaser line.", "", "<!--more-->", "", "Body line."].join("\n");
    expect(extractExcerpt(md)).toBe("Teaser line.");
  });

  it("accepts mixed case and whitespace", () => {
    expect(extractExcerpt("Teaser.\n\n<!--  MORE  -->\n\nBody.")).toBe(
      "Teaser."
    );
    expect(extractExcerpt("Teaser.\n\n<!--more -->\n\nBody.")).toBe("Teaser.");
    expect(extractExcerpt("Teaser.\n\n<!-- more-->\n\nBody.")).toBe("Teaser.");
  });

  it("uses only the first marker", () => {
    const md = [
      "Intro.",
      "",
      "<!-- more -->",
      "",
      "Hidden start.",
      "",
      "<!-- more -->",
      "",
      "More hidden.",
    ].join("\n");
    // Everything before the FIRST marker becomes the excerpt; the second
    // marker stays in the body and is not re-read.
    expect(extractExcerpt(md)).toBe("Intro.");
  });

  it("returns undefined when the body is empty before the marker", () => {
    expect(extractExcerpt("<!-- more -->\n\nBody starts now.")).toBeUndefined();
  });

  it("returns undefined for empty or missing body", () => {
    expect(extractExcerpt(undefined)).toBeUndefined();
    expect(extractExcerpt("")).toBeUndefined();
    expect(extractExcerpt(null)).toBeUndefined();
  });
});

describe("extractExcerpt — fenced code blocks", () => {
  it("ignores a marker written inside a fenced code block", () => {
    const md = [
      "Teaser paragraph.",
      "",
      "```md",
      "<!-- more -->",
      "```",
      "",
      "Body after the fence.",
    ].join("\n");
    expect(extractExcerpt(md)).toBeUndefined();
  });

  it("still extracts up to a marker that comes after a fence", () => {
    const md = [
      "Teaser paragraph.",
      "",
      "```md",
      "some example",
      "```",
      "",
      "Closing thought.",
      "",
      "<!-- more -->",
      "",
      "Rest.",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Teaser paragraph. Closing thought.");
  });

  it("handles tilde fences and unclosed fences", () => {
    // An unclosed fence consumes everything after it; the marker becomes
    // unreachable, so no excerpt is extracted. This is the safe default.
    const md = ["Teaser.", "", "~~~", "", "<!-- more -->"].join("\n");
    expect(extractExcerpt(md)).toBeUndefined();
  });

  it("only matches identical-fence closings (CommonMark rule 4.5)", () => {
    // ``` closes ```, ~ closes ~ — a stray ``` inside a ~~~ fence shouldn't
    // close the block.
    const md = [
      "Teaser.",
      "",
      "~~~",
      "",
      "```",
      "",
      "<!-- more -->",
      "",
      "still inside fence",
      "",
      "~~~",
      "",
      "Outside fence.",
    ].join("\n");
    expect(extractExcerpt(md)).toBeUndefined();
  });
});

describe("extractExcerpt — markdown stripping", () => {
  it("strips ATX heading prefixes", () => {
    const md = [
      "## Why this matters",
      "",
      "Because it's useful.",
      "",
      "<!-- more -->",
      "",
      "More below.",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Why this matters Because it's useful.");
  });

  it("strips inline links to their label", () => {
    const md = [
      "Read [the docs](https://example.com) for more.",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Read the docs for more.");
  });

  it("strips inline image syntax to the alt text", () => {
    const md = [
      "![Diagram](./diagram.png) shows the flow.",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Diagram shows the flow.");
  });

  it("strips bold/italic/strikethrough markers", () => {
    const md = [
      "**bold** *italic* ~~struck~~ ==mark== text.",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("bold italic struck mark text.");
  });

  it("strips inline code backticks but keeps the code text", () => {
    const md = ["Use `pnpm build` to ship.", "", "<!-- more -->"].join("\n");
    expect(extractExcerpt(md)).toBe("Use pnpm build to ship.");
  });

  it("strips leading list markers and blockquotes", () => {
    const md = [
      "- bullet one",
      "- bullet two",
      "",
      "> a quoted line",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("bullet one bullet two a quoted line");
  });

  it("drops whole lines that are raw HTML tags", () => {
    const md = [
      "<aside>some aside</aside>",
      "",
      "Teaser text.",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Teaser text.");
  });

  it("strips HTML comments written in the excerpt body", () => {
    const md = [
      "Visible line.",
      "",
      "<!-- TODO: reword later -->",
      "",
      "Another visible line.",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Visible line. Another visible line.");
  });

  it("collapses whitespace runs and markdown hard breaks", () => {
    const md = [
      "Line one",
      "still line one",
      "",
      "Line two",
      "",
      "<!-- more -->",
    ].join("\n");
    expect(extractExcerpt(md)).toBe("Line one still line one Line two");
  });

  it("handles a hard line break (`\\` at end of line)", () => {
    const md = ["First half\\\nSecond half.", "", "<!-- more -->"].join("\n");
    expect(extractExcerpt(md)).toBe("First half Second half.");
  });
});

describe("postDescription — fallback contract", () => {
  it("returns frontmatter description when present (author wins)", () => {
    const body = "Teaser from body.\n\n<!-- more -->";
    const post = fakePost(
      { description: "Author-supplied description." },
      body
    );
    expect(postDescription(post)).toBe("Author-supplied description.");
  });

  it("whitespace-only description falls back to the body excerpt", () => {
    const body = "Teaser from body.\n\n<!-- more -->";
    const post = fakePost({ description: "   " }, body);
    expect(postDescription(post)).toBe("Teaser from body.");
  });

  it("returns the excerpt when description is missing", () => {
    const body = "Teaser from body.\n\n<!-- more -->";
    const post = fakePost({}, body);
    expect(postDescription(post)).toBe("Teaser from body.");
  });

  it("returns undefined when neither description nor marker exists", () => {
    const post = fakePost({}, "Just a body, no separator.");
    expect(postDescription(post)).toBeUndefined();
  });
});
