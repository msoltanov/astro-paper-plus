import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeHeadingAnchors from "@/utils/rehypeHeadingAnchors";

/**
 * Default pipeline: `remarkParse → remarkRehype → rehypeSlug → rehypeHeadingAnchors → rehypeStringify`.
 * Mirrors the actual `src/remark-plugins.ts` chain (slug first so headings
 * carry a stable `id` before the anchor plugin runs), so failures here
 * mean real bugs at build time.
 */
async function runMarkdown(md: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeHeadingAnchors)
    .use(rehypeStringify);
  const file = await processor.process(md);
  return String(file);
}

/** Pipeline for raw HTML input (the `.mdx` author path). */
async function runHtml(html: string): Promise<string> {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSlug)
    .use(rehypeHeadingAnchors)
    .use(rehypeStringify);
  const file = await processor.process(html);
  return String(file);
}

/** Pipeline that runs the anchor plugin on a HAST tree that has NO ids
 * yet — exercises the slug-fallback path (heading has no `id` because
 * `rehype-slug` didn't run, or was skipped). */
async function runHtmlNoSlug(html: string): Promise<string> {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeHeadingAnchors)
    .use(rehypeStringify);
  const file = await processor.process(html);
  return String(file);
}

/** Pull every opening heading tag (`h2`–`h6`) out of output HTML. */
function headTags(html: string): string[] {
  return html.match(/<h[2-6]\b[^>]*>/g) ?? [];
}

/** Pull the first `.heading-link` anchor out of output HTML. */
function firstAnchor(html: string): string | null {
  const m = html.match(/<a\b[^>]*\bclass="[^"]*\bheading-link\b[^"]*"[^>]*>/);
  return m ? m[0] : null;
}

/** Count `class="heading-link …"` anchors in output HTML. */
function anchorCount(html: string): number {
  return (html.match(/class="[^"]*\bheading-link\b[^"]*"/g) ?? []).length;
}

describe("rehypeHeadingAnchors", () => {
  it("appends a .heading-link anchor to every h2-h6", async () => {
    const out = await runMarkdown(
      "## First heading\n\nSome text.\n\n### Nested heading\n"
    );
    // Two headings in, two anchors out.
    expect(anchorCount(out)).toBe(2);
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    // class tokens are present
    expect(a).toMatch(/\bheading-link\b/);
    expect(a).toMatch(/\bms-2\b/);
    expect(a).toMatch(/\bmd:group-hover:opacity-100\b/);
    // href points at the slug
    expect(a).toMatch(/href="#first-heading"/);
  });

  it("adds the `group` class to the heading itself", async () => {
    const out = await runMarkdown("## Tailwind target heading");
    // The heading tag must carry `group` so `group-hover:` resolves in
    // the produced .heading-link className.
    expect(out).toMatch(/<h2\b[^>]*\bclass="[^"]*\bgroup\b[^"]*"/);
  });

  it("uses the id from rehype-slug (not a slug it derives itself)", async () => {
    // Two headings with the same text would normally collide on a naive
    // slugs-only derivation. rehype-slug disambiguates with -1, -2; this
    // plugin must consume whatever `id` is on the node rather than
    // re-derive and break the link.
    const out = await runMarkdown("## Same heading\n\n## Same heading\n");
    // Two anchors, two distinct hrefs — the second id has the -1 suffix.
    const hrefs = out.match(/href="#[^"]*"/g) ?? [];
    expect(hrefs.length).toBe(2);
    expect(hrefs[0]).toBe('href="#same-heading"');
    expect(hrefs[1]).toBe('href="#same-heading-1"');
  });

  it('renders the inner <span aria-hidden="true">#</span>', async () => {
    const out = await runMarkdown("## Heading");
    // The literal `#` glyph must be present (for sighted readers); it
    // sits inside an `aria-hidden` span so screen readers don't
    // announce "hash".
    expect(out).toMatch(
      /<a\b[^>]*\bclass="[^"]*\bheading-link\b[^"]*"[^>]*>.*<span aria-hidden="true">#<\/span>.*<\/a>/s
    );
  });

  it("sets aria-label on the anchor for assistive tech", async () => {
    const out = await runMarkdown("## Heading");
    const a = firstAnchor(out);
    expect(a).toBeTruthy();
    expect(a).toMatch(/aria-label="Permalink to this heading"/);
  });

  it("skips h1 — only body headings are targeted", async () => {
    const out = await runMarkdown("# Page title\n\n## Body section\n");
    // h1 is intentionally excluded; only the h2 gets an anchor.
    expect(out).toMatch(/<h1\b[^>]*>Page title<\/h1>/);
    expect(out).not.toMatch(/<h1\b[^>]*\bclass="group"/);
    expect(anchorCount(out)).toBe(1);
    // h2 still gets anchored
    expect(out).toMatch(/<h2\b[^>]*\bclass="[^"]*\bgroup\b[^"]*"/);
  });

  it("does not double-add `group` if the heading already has it", async () => {
    const out = await runHtml('<h2 id="x" class="group">Already grouped</h2>');
    // `group` should appear exactly once in the class list.
    const cls = out.match(/<h2\b[^>]*\bclass="([^"]*)"/)?.[1] ?? "";
    const matches = cls.split(/\s+/).filter(t => t === "group");
    expect(matches.length).toBe(1);
    // and the anchor still appears
    expect(anchorCount(out)).toBe(1);
  });

  it("is idempotent — running twice does not stack anchors", async () => {
    // Construct a pipeline that runs the plugin twice (emulates a
    // build path where some future refactor accidentally double-
    // registers the plugin).
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeHeadingAnchors)
      .use(rehypeHeadingAnchors)
      .use(rehypeStringify);
    const file = await processor.process('<h2 id="x">Heading</h2>');
    const html = String(file);
    expect(anchorCount(html)).toBe(1);
  });

  it("opts a heading out via the no-heading-anchors class token", async () => {
    const out = await runHtml(
      '<h2 id="x" class="no-heading-anchors">Skip me</h2>'
    );
    expect(anchorCount(out)).toBe(0);
    // `group` was NOT added — the heading is left exactly as the
    // author wrote it.
    expect(out).not.toMatch(/<h2\b[^>]*\bclass="[^"]*\bgroup\b[^"]*"/);
    expect(out).toContain('<h2 id="x" class="no-heading-anchors">Skip me</h2>');
  });

  it("opts a heading out via the data-no-heading-anchors attribute", async () => {
    const out = await runHtml(
      '<h2 id="x" data-no-heading-anchors="true">Skip me</h2>'
    );
    expect(anchorCount(out)).toBe(0);
    expect(out).toContain(
      '<h2 id="x" data-no-heading-anchors="true">Skip me</h2>'
    );
  });

  it("refuses to add an anchor inside a heading that's nested in <a>", async () => {
    const out = await runHtml(
      '<a href="/x"><h2 id="nested">Never anchor me</h2></a>'
    );
    // No anchor inside the heading — the parent <a> forbids it.
    expect(anchorCount(out)).toBe(0);
    // The heading itself is still present, untouched.
    expect(out).toMatch(/<h2\b[^>]*\bid="nested"[^>]*>Never anchor me<\/h2>/);
  });

  it("refuses to add an anchor inside a heading that's nested in <button>", async () => {
    const out = await runHtml(
      '<button><h2 id="b">Inside a button</h2></button>'
    );
    expect(anchorCount(out)).toBe(0);
  });

  it("falls back to a derived slug when rehype-slug is absent", async () => {
    // No `rehype-slug` in the chain, no `id` on the input — the anchor
    // plugin must compute one and write it back to the heading so the
    // produced link still resolves in the DOM.
    const out = await runHtmlNoSlug("<h2>Heading With Mixed Case</h2>");
    expect(anchorCount(out)).toBe(1);
    const a = firstAnchor(out);
    expect(a).toMatch(/href="#heading-with-mixed-case"/);
    // The id was applied back to the heading so the link is a real target.
    expect(out).toMatch(/<h2\b[^>]*\bid="heading-with-mixed-case"/);
  });

  it("keeps the heading itself usable when text is empty", async () => {
    // Empty heading: rehype-slug can fail to give it an id, our derived
    // slug is also empty, we fall back to "_" so the link still resolves
    // rather than pointing at "#".
    const out = await runHtmlNoSlug("<h2></h2>");
    expect(anchorCount(out)).toBe(1);
    const a = firstAnchor(out);
    expect(a).toMatch(/href="#_"/);
  });

  it("respects a custom anchorClassName option", async () => {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeHeadingAnchors, {
        anchorClassName: "my-custom-class always-visible",
      })
      .use(rehypeStringify);
    const file = await processor.process('<h2 id="x">Heading</h2>');
    const out = String(file);
    expect(out).toMatch(/class="my-custom-class always-visible"/);
    // Default class tokens are NOT mixed in — the option fully replaces.
    expect(out).not.toMatch(/heading-link/);
  });

  it("respects a custom ariaLabel option", async () => {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeHeadingAnchors, { ariaLabel: "Jump to this section" })
      .use(rehypeStringify);
    const file = await processor.process('<h2 id="x">Heading</h2>');
    const out = String(file);
    expect(out).toContain('aria-label="Jump to this section"');
    expect(out).not.toMatch(/aria-label="Permalink to this heading"/);
  });

  it("respects a custom include option", async () => {
    // Force h1 to be in scope for this one build.
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeHeadingAnchors, { include: ["h1"] })
      .use(rehypeStringify);
    const file = await processor.process(
      '<h1 id="t">Title</h1><h2 id="s">Section</h2>'
    );
    const out = String(file);
    // h1 now gets the anchor; h2 does not (because include was narrowed).
    expect((out.match(/<h1\b[^>]*\bclass="group"/g) ?? []).length).toBe(1);
    expect((out.match(/<h2\b[^>]*\bclass="group"/g) ?? []).length).toBe(0);
    expect(anchorCount(out)).toBe(1);
  });

  it("does not anchor anything when enabled is false", async () => {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeHeadingAnchors, { enabled: false })
      .use(rehypeStringify);
    const file = await processor.process('<h2 id="x">A</h2><h3 id="y">B</h3>');
    const out = String(file);
    expect(anchorCount(out)).toBe(0);
    // No `group` class was added either — the plugin is a clean no-op.
    expect(out).not.toMatch(/\bgroup\b/);
  });

  it("does not interfere with callouts or other rehype plugins", async () => {
    // rehype-callouts transforms `> [!NOTE]\n# Heading` into a div
    // structure. Even after that, an h3 inside the callout should still
    // be anchorable by this plugin. (rehype-callouts doesn't ship in
    // our test dependency tree, so we simulate the resulting HAST by
    // checking that the plugin walks headings regardless of their
    // grandparent. This is a structural sanity test, not a full
    // callouts-integration test.)
    const out = await runHtml(
      '<div class="callout"><h3 id="c">Heading in callout</h3></div>'
    );
    expect(anchorCount(out)).toBe(1);
    expect(out).toMatch(/<a\b[^>]*\bhref="#c"/);
  });

  it("round-trip on a multi-heading Markdown post body is correct", async () => {
    // Sanity test mirroring the shape of a long blog post: nested
    // headings with mixed depth, a duplicate heading text, and an
    // opt-out on one section.
    const md = [
      "## Intro",
      "",
      "Body.",
      "",
      "### Getting started",
      "",
      "Body.",
      "",
      "### Getting started", // duplicate → must get -1
      "",
      "Body.",
      "",
      '## Sidebar <span data-no-heading-anchors="true">opt-out</span>',
      // ^ note: a markdown heading cannot carry attributes, so we use
      // raw HTML in `.mdx`. This test still exercises the path because
      // `rehypeParse → rehypeSlug` runs first and produces an id; the
      // opt-out attribute on the inner span doesn't affect the heading
      // itself.
      "",
      "## Conclusion",
    ].join("\n");
    const out = await runMarkdown(md);
    // 4 markdown headings + 1 raw HTML <h2> inside a heading line that
    // got parsed as nested HTML — verify what's actually anchored:
    expect(headTags(out).length).toBeGreaterThanOrEqual(4);
    // Anchor on `## Intro`
    expect(out).toMatch(
      /<a[^>]*\bclass="[^"]*\bheading-link\b[^"]*"[^>]*\bhref="#intro"/
    );
    // Anchor on `### Getting started` (slugged by rehype-slug twice)
    expect(out).toMatch(/href="#getting-started"/);
    // Anchor on `### Getting started` (duplicate → id = getting-started-1)
    expect(out).toMatch(/href="#getting-started-1"/);
    // Anchor on `## Conclusion`
    expect(out).toMatch(/href="#conclusion"/);
  });
});
