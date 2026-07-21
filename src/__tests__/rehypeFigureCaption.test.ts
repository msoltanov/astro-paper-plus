import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeFigureCaption from "@/utils/rehypeFigureCaption";

/**
 * Run a markdown string through the production pipeline:
 * `remarkParse → remarkRehype → rehypeFigureCaption → rehypeStringify`.
 * This mirrors the real `.md`/`.mdx` build path the plugin runs under,
 * so failures here would mean real bugs at build time.
 *
 * CommonMark's image-with-title syntax is `![alt](src "title")` — the
 * the `title` is the part we promote to figcaption.
 */
async function runMarkdown(md: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeFigureCaption)
    .use(rehypeStringify);
  const file = await processor.process(md);
  return String(file);
}

/**
 * Run a raw HTML string through the plugin. Exercises the path for
 * `.mdx` authors who write `<img title="…">` HTML directly in their
 * posts — the markdown pipeline preserves that HTML, and our rehype
 * walker still needs to act on it.
 */
async function runHtml(html: string): Promise<string> {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeFigureCaption)
    .use(rehypeStringify);
  const file = await processor.process(html);
  return String(file);
}

/** Pull the first `<img>` opening tag out of output HTML. */
function firstImg(html: string): string | null {
  const m = html.match(/<img\b[^>]*>/);
  return m ? m[0] : null;
}

/** Pull every `<img>` opening tag out of output HTML. */
function allImgs(html: string): string[] {
  return html.match(/<img\b[^>]*>/g) ?? [];
}

/** Pull the first `<figcaption>` element out of output HTML. */
function firstFigcaption(html: string): string | null {
  const m = html.match(/<figcaption>[\s\S]*?<\/figcaption>/);
  return m ? m[0] : null;
}

/** Count figcaptions in output HTML. */
function figcaptionCount(html: string): number {
  return (html.match(/<figcaption>/g) ?? []).length;
}

describe("rehypeFigureCaption", () => {
  it("wraps an image with a Markdown title in a <figure><figcaption>", async () => {
    const out = await runMarkdown(
      '![alt text](/photo.png "A photo from the trip")'
    );
    expect(out).toMatch(/<figure[^>]*>/);
    // Alt survives untouched — only `title` is consumed.
    expect(firstImg(out)).toContain('alt="alt text"');
    expect(firstImg(out)).toContain('src="/photo.png"');
    expect(firstFigcaption(out)).toBe(
      "<figcaption>A photo from the trip</figcaption>"
    );
  });

  it("strips the title attribute from the <img> after promoting it", async () => {
    const out = await runMarkdown('![alt](/photo.png "Caption here")');
    const img = firstImg(out);
    expect(img).not.toBeNull();
    // `title` must NOT survive on the img — otherwise the same text
    // would render twice (once as figcaption, once as a hover tooltip).
    expect(img).not.toMatch(/\btitle=/);
  });

  it("leaves images without a title untouched (no figcaption, no figure)", async () => {
    const out = await runMarkdown("![alt text](/photo.png)");
    // No figcaption, no figure wrap — the 99% case is unchanged.
    expect(figcaptionCount(out)).toBe(0);
    expect(out).not.toMatch(/<figure/);
    expect(firstImg(out)).toContain('alt="alt text"');
    expect(firstImg(out)).toContain('src="/photo.png"');
  });

  it("skips images whose title is empty or whitespace-only", async () => {
    const empty = await runMarkdown('![alt](/a.png "")');
    expect(figcaptionCount(empty)).toBe(0);
    expect(empty).not.toMatch(/<figure/);

    const whitespace = await runMarkdown('![alt](/a.png "   ")');
    expect(figcaptionCount(whitespace)).toBe(0);
    // Whitespace-only title is a no-op for the plugin: it doesn't wrap,
    // and we leave the attribute alone (the author wrote it; if the
    // browser renders an empty tooltip from a whitespace-only title,
    // that's an authoring accident on their side, not ours to fix).
    expect(whitespace).not.toMatch(/<figure/);
  });

  it("handles a mix of captioned and non-captioned images", async () => {
    const out = await runMarkdown(
      '![with caption](/a.png "Caption A")\n\n![no caption](/b.png)'
    );
    // Two imgs survive, only one gets wrapped.
    expect(allImgs(out)).toHaveLength(2);
    expect(out).toMatch(/<figure[\s\S]*<img[\s\S]*\/a\.png[\s\S]*<\/figure>/);
    // The unwrapped image is just a bare <img> inside its <p>.
    expect(out).toContain('<img src="/b.png" alt="no caption"');
    expect(figcaptionCount(out)).toBe(1);
    expect(out).toContain("<figcaption>Caption A</figcaption>");
  });

  it("escapes HTML special characters in the figcaption text", async () => {
    const out = await runMarkdown(
      '![alt](/x.png "A & B <script>alert(1)</script>")'
    );
    // rehype-stringify escapes the special chars to entities (numeric or
    // named — the exact form is its call). The meaningful invariant is
    // that the script tag never parses as HTML, yet the visible text
    // does survive inside the figcaption for sighted readers.
    expect(out).toContain("<figcaption>");
    expect(out).toContain("alert(1)");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("</script>");
  });

  it("works on raw HTML — the .mdx-author path", async () => {
    const out = await runHtml(
      '<img src="/raw.png" alt="raw" title="This is a raw-HTML caption" />'
    );
    expect(out).toMatch(/<figure/);
    expect(out).toContain(
      "<figcaption>This is a raw-HTML caption</figcaption>"
    );
    expect(firstImg(out)).toContain('alt="raw"');
    expect(firstImg(out)).not.toMatch(/\btitle=/);
  });

  it("does not double-wrap an image already inside a <figure>", async () => {
    // The author's hand-rolled figcaption must win. We verify by
    // structure: one figure, one figcaption, and the inner img's title
    // attribute is left intact (it's a perfectly valid hover tooltip
    // on a hand-rolled figure — the plugin declines to interfere).
    const out = await runHtml(
      "<figure>" +
        '<img src="/hand.png" alt="hand" title="tooltip stays" />' +
        "<figcaption>Existing caption beats the title</figcaption>" +
        "</figure>"
    );
    // Exactly one figure wrap.
    expect((out.match(/<figure/g) ?? []).length).toBe(1);
    // Exactly one figcaption (the author's), not two.
    expect(figcaptionCount(out)).toBe(1);
    expect(out).toContain(
      "<figcaption>Existing caption beats the title</figcaption>"
    );
    // Inner img's title survives the skip — it's a legitimate hover
    // tooltip that the plugin neither injected nor stripped.
    expect(out).toContain('title="tooltip stays"');
  });

  it("refuses to wrap an <img> sitting inside an <a> (HTML5 forbids this)", async () => {
    // `[![alt](src)](href)` is the markdown image-as-link pattern.
    const out = await runMarkdown(
      '[![alt](/thumb.png "Link caption")](https://example.com)'
    );
    // No figure wrap — `<a>` cannot legally contain `<figure>`.
    expect(out).not.toMatch(/<figure/);
    // The img inside <a> still renders (it's a linkable thumbnail).
    expect(out).toContain("<img");
  });

  // #7 A11Y — the markdown image-as-link pattern (`[![alt](src
  // "title")](href)`) cannot be wrapped in a `<figure>` because
  // `<a>` can't contain block-level elements. When the link has
  // no other accessible name, promote the image's `title` to
  // `aria-label` on the parent `<a>` so screen readers announce
  // it (most don't announce img titles via tooltip alone), and
  // strip it from the `<img>` so the same text doesn't render
  // twice as both aria-label and hover tooltip.
  //
  // The promotion only fires when the link has NO accessible
  // name already — otherwise we'd overwrite an explicit
  // `aria-label`, `aria-labelledby`, visible text, OR the child
  // `<img alt>` text alternative (which per WAI-ARIA accname
  // 1.2 step 2F is already the link's name). When the link is
  // already named, leave the img's `title` as a hover tooltip
  // for sighted users and do nothing else.
  it("#7: link-wrapped image with empty alt promotes title to aria-label on the parent <a>", async () => {
    // `<a><img alt=""></a>` — empty alt, so the link has no name.
    // The img title must be promoted (otherwise no name source at all).
    const out = await runMarkdown(
      '[![](/thumb.png "Link caption")](https://example.com)'
    );
    expect(out).toMatch(/<a[^>]*aria-label="Link caption"[^>]*>/);
    // Title is stripped from the img so it doesn't render twice.
    const img = firstImg(out);
    expect(img).not.toBeNull();
    expect(img).not.toMatch(/\btitle=/);
  });

  it("#7: link-wrapped image with non-empty alt does NOT promote title (alt is already the link name)", async () => {
    // `<a><img alt="alt" title="Link caption"></a>` — non-empty alt
    // means the link is already named "alt" per WAI-ARIA. Promoting
    // the title to aria-label would silently overwrite that name
    // AND strip the hover tooltip the author wrote for sighted users.
    const out = await runMarkdown(
      '[![alt](/thumb.png "Link caption")](https://example.com)'
    );
    // No aria-label injected — alt already names the link.
    expect(out).not.toMatch(/aria-label=/);
    // The img's title survives as a hover tooltip for sighted users.
    expect(out).toContain('title="Link caption"');
    // Alt survives on the img untouched.
    expect(out).toContain('alt="alt"');
  });

  // #7 follow-up — the same promotion-vs-preservation rule applies
  // to the raw-HTML path (`.mdx` authors writing `<a><img …></a>`).
  it("#7: raw-HTML link-wrapped image with non-empty alt preserves title", async () => {
    const out = await runHtml(
      '<a href="/x"><img src="/y.png" alt="y" title="Raw link cap" /></a>'
    );
    expect(out).not.toMatch(/aria-label=/);
    // Title stays as a hover tooltip — preserved, not promoted.
    expect(out).toContain('title="Raw link cap"');
    expect(out).toContain('alt="y"');
    // No figure wrap (HTML5 invalid).
    expect(out).not.toMatch(/<figure/);
  });

  // #7 guard — if the link already has an accessible name (explicit
  // `aria-label`, `aria-labelledby`, or visible text), the title must
  // NOT be promoted to `aria-label` because that would silently
  // overwrite the author's choice. The img's `title` is also kept as
  // a hover tooltip for sighted users — promoting without stripping
  // would create the same duplicate-announcement problem the original
  // change was meant to avoid, but with the wrong base name.
  it("#7: does NOT overwrite an existing aria-label on the parent <a>", async () => {
    const out = await runHtml(
      '<a href="/x" aria-label="Download"><img src="/y.png" alt="y" title="Screenshot" /></a>'
    );
    // Author's explicit label survives untouched.
    expect(out).toMatch(/<a[^>]*aria-label="Download"[^>]*>/);
    // And the image title is NOT promoted on top of it (no second
    // aria-label, no overwrite).
    expect(out).not.toMatch(/aria-label="Screenshot"/);
  });

  it("#7: does NOT promote title when the link is named by aria-labelledby", async () => {
    const out = await runHtml(
      '<span id="cap">Download</span><span id="extra"> file</span><a href="/x" aria-labelledby="cap extra"><img src="/y.png" alt="" title="Tooltip" /></a>'
    );
    // The explicit aria-labelledby label already names the link, so
    // the img title must stay a hover tooltip instead of being promoted.
    expect(out).toMatch(/aria-labelledby="cap extra"/);
    expect(out).not.toMatch(/aria-label="Tooltip"/);
    expect(out).toContain('title="Tooltip"');
  });

  it("#7: does NOT promote title when the link has visible text content", async () => {
    // `<a><img title="Screenshot">Read more</a>` — the visible text
    // "Read more" is the link's accessible name. Promoting the img
    // title would override that and break sighted users who rely on
    // the visible label, AND change what screen readers announce.
    const out = await runHtml(
      '<a href="/x"><img src="/y.png" alt="y" title="Screenshot" />Read more</a>'
    );
    expect(out).not.toMatch(/aria-label="Screenshot"/);
    // No figure wrap (HTML5 invalid).
    expect(out).not.toMatch(/<figure/);
    // Link text is preserved.
    expect(out).toMatch(/Read more/);
  });

  // Regression — `<a><img alt="…" title="…"></a>` is already named
  // by the img's `alt` per WAI-ARIA accname 1.2 step 2F. Without
  // `<img alt>` in the link-named check, the plugin treated this as
  // "unnamed" and promoted the img's `title` (a hover-tooltip
  // string) to `aria-label` on the link — silently overwriting the
  // authored alt with the tooltip text and stripping the tooltip
  // sighted users relied on.
  it("#7: does NOT promote title when the link is named by <img alt>", async () => {
    const out = await runHtml(
      '<a href="/x"><img src="/chart.png" alt="Chart" title="Open full size" /></a>'
    );
    // No aria-label injected — the alt is already the link's name.
    expect(out).not.toMatch(/aria-label=/);
    // The img's title survives as a hover tooltip for sighted users.
    // `runHtml` quotes the attribute with double quotes via rehype-stringify.
    expect(out).toContain('title="Open full size"');
    // Alt survives untouched on the img.
    expect(out).toContain('alt="Chart"');
    // No figure wrap (HTML5 invalid).
    expect(out).not.toMatch(/<figure/);
  });

  // Empty alt on the child `<img>` is NOT a name source — the
  // plugin should still promote title → aria-label in that case.
  it("#7: DOES promote title when the link child <img> has empty alt", async () => {
    const out = await runHtml(
      '<a href="/x"><img src="/y.png" alt="" title="Decoration tooltip" /></a>'
    );
    // Empty alt → no name from the img, so title gets promoted.
    expect(out).toMatch(/<a[^>]*aria-label="Decoration tooltip"[^>]*>/);
    const img = firstImg(out);
    expect(img).not.toBeNull();
    expect(img).not.toMatch(/\btitle=/);
  });

  // Regression — `<a><strong>Read more</strong><img title="…"></a>`
  // is named by the nested `<strong>` text. Previously
  // `linkHasAccessibleName` only inspected DIRECT children, so the
  // `<img>` was the only child consulted → no name found → title
  // was promoted → real visible label was overwritten on screen
  // readers. Now `subtreeHasTextEquivalent` recurses and the
  // inner text wins.
  it("#7: does NOT promote title when visible label is wrapped in a child element (e.g. <strong>)", async () => {
    const out = await runHtml(
      '<a href="/x"><strong>Read more</strong><img src="/y.png" alt="y" title="Screenshot" /></a>'
    );
    // No aria-label injected — the nested <strong> text is the link's
    // accessible name.
    expect(out).not.toMatch(/aria-label=/);
    // Title preserved as a hover tooltip for sighted users.
    expect(out).toContain('title="Screenshot"');
    // Visible text preserved.
    expect(out).toMatch(/Read more/);
    expect(out).not.toMatch(/<figure/);
  });

  // Companion — `<a><em><strong>Read more</strong></em><img></a>`
  // (double-nested label) also has a name; recursion must keep
  // walking past `<em>` and find the text.
  it("#7: recurses through nested wrapper elements to find the visible label", async () => {
    const out = await runHtml(
      '<a href="/x"><em><strong>Read more</strong></em><img src="/y.png" alt="y" title="Screenshot" /></a>'
    );
    expect(out).not.toMatch(/aria-label=/);
    expect(out).toContain('title="Screenshot"');
    expect(out).toMatch(/Read more/);
  });

  // Regression — the link-wrap branch fired before the no-caption
  // guard was factored out, so a linked thumbnail that the author
  // had explicitly opted out of via `data-no-caption` (or the
  // `.no-caption` class) STILL had its title promoted to the
  // surrounding `<a>`'s `aria-label`. Authors wanting
  // tooltip-only on a linked image had no way to express it.
  it("link-wrapped img with data-no-caption does NOT get its title promoted", async () => {
    // Plain linked image with no other accessible name and an
    // active `data-no-caption` opt-out → the promotion must be
    // suppressed, leaving `title` as a hover tooltip.
    const out = await runHtml(
      '<a href="/x"><img src="/thumb.png" alt="" data-no-caption="true" title="Tooltip only" /></a>'
    );
    expect(out).not.toMatch(/aria-label=/);
    expect(out).toContain('title="Tooltip only"');
    expect(out).not.toMatch(/<figure/);
  });

  it("link-wrapped img with .no-caption class does NOT get its title promoted", async () => {
    const out = await runHtml(
      '<a href="/x"><img src="/thumb.png" alt="" class="no-caption" title="Tooltip only" /></a>'
    );
    expect(out).not.toMatch(/aria-label=/);
    expect(out).toContain('title="Tooltip only"');
    expect(out).not.toMatch(/<figure/);
  });

  it("opts an image out via the data-no-caption attribute", async () => {
    const out = await runHtml(
      '<img src="/a.png" alt="a" title="should be skipped" data-no-caption="true" />'
    );
    expect(out).not.toMatch(/<figure/);
    // Title stays put when we skip — the author wanted a tooltip, not a caption.
    expect(out).toContain('title="should be skipped"');
    expect(figcaptionCount(out)).toBe(0);
  });

  it("opts an image out via the .no-caption class token", async () => {
    const out = await runHtml(
      '<img src="/a.png" alt="a" title="tooltip only" class="foo no-caption bar" />'
    );
    expect(out).not.toMatch(/<figure/);
    expect(out).toContain('title="tooltip only"');
    expect(figcaptionCount(out)).toBe(0);
  });

  it("preserves all other attributes on the wrapped image", async () => {
    // Markdown image syntax can't carry arbitrary attributes — exercise
    // the realistic load case via the HTML pipeline.
    const outHtml = await runHtml(
      '<img src="/x.png" alt="alt" title="Cap" loading="lazy" width="800" height="600" />'
    );
    expect(figcaptionCount(outHtml)).toBe(1);
    const img = firstImg(outHtml);
    // We must NOT have stripped author-set attributes during the wrap.
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('width="800"');
    expect(img).toContain('height="600"');
    // Only `title` should be missing.
    expect(img).not.toMatch(/\btitle=/);
  });

  it("does not touch non-img elements", async () => {
    const out = await runHtml(
      "<p>plain text</p>" +
        '<a href="/x" title="link title, should NOT become a figcaption"><img src="/link.png" alt="x" /></a>' +
        '<svg viewBox="0 0 10 10"><title>svg title, also skipped</title><rect width="10" height="10"/></svg>'
    );
    // SVG and <a> titles must stay where they are — we only operate on
    // <img> elements whose *parent* is NOT a link.
    expect(out).toContain("<title>svg title, also skipped</title>");
    expect(figcaptionCount(out)).toBe(0);
    expect(out).not.toMatch(/<figure/);
  });

  it("can be disabled via the `enabled: false` option", async () => {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeFigureCaption, { enabled: false })
      .use(rehypeStringify);
    const file = await processor.process(
      '<img src="/a.png" alt="a" title="Caption that must NOT render" />'
    );
    const html = String(file);
    expect(figcaptionCount(html)).toBe(0);
    expect(html).not.toMatch(/<figure/);
    // Title stays on the img as a tooltip.
    expect(html).toContain('title="Caption that must NOT render"');
  });
});
