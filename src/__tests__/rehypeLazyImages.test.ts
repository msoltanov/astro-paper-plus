import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeLazyImages from "@/utils/rehypeLazyImages";

/**
 * Run a markdown string through the production pipeline:
 * `remarkParse → remarkRehype → rehypeLazyImages → rehypeStringify`.
 * This mirrors the real `.md`/`.mdx` build path the plugin runs under,
 * so failures here would mean real bugs at build time.
 */
async function runMarkdown(md: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeLazyImages)
    .use(rehypeStringify);
  const file = await processor.process(md);
  return String(file);
}

/**
 * Run a raw HTML string through the plugin. This exercises the path
 * for `.mdx` authors who write `<img>` HTML directly in their posts —
 * the markdown pipeline preserves that HTML, and our rehype walker
 * still needs to add the loading hints.
 */
async function runHtml(html: string): Promise<string> {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeLazyImages)
    .use(rehypeStringify);
  const file = await processor.process(html);
  return String(file);
}

/** Pull a single `<img>` element out of the output HTML. */
function firstImg(html: string): string | null {
  const m = html.match(/<img\b[^>]*>/);
  return m ? m[0] : null;
}

function allImgs(html: string): string[] {
  return html.match(/<img\b[^>]*>/g) ?? [];
}

describe("rehypeLazyImages", () => {
  it("marks the first image as the LCP candidate (eager + high priority)", async () => {
    const out = await runMarkdown("![hero](/hero.png)\n\n![body](/body.png)");
    const imgs = allImgs(out);
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toContain('loading="eager"');
    expect(imgs[0]).toContain('fetchpriority="high"');
  });

  it("marks every subsequent image lazy + async", async () => {
    const out = await runMarkdown(
      "![hero](/hero.png)\n\n![a](/a.png)\n\n![b](/b.png)"
    );
    const imgs = allImgs(out);
    expect(imgs).toHaveLength(3);
    // First: LCP.
    expect(imgs[0]).toContain('loading="eager"');
    expect(imgs[0]).toContain('fetchpriority="high"');
    // Rest: lazy + async.
    expect(imgs[1]).toContain('loading="lazy"');
    expect(imgs[1]).toContain('decoding="async"');
    expect(imgs[2]).toContain('loading="lazy"');
    expect(imgs[2]).toContain('decoding="async"');
  });

  it("works when there is only one image (still gets LCP treatment)", async () => {
    const out = await runMarkdown("![only](/only.png)");
    const img = firstImg(out);
    expect(img).not.toBeNull();
    expect(img).toContain('loading="eager"');
    expect(img).toContain('fetchpriority="high"');
  });

  it('respects an explicit loading="eager" attribute', async () => {
    const out = await runHtml(
      '<p><img src="/a.png" alt="a" /></p>' +
        '<p><img src="/b.png" alt="b" loading="eager" /></p>'
    );
    const imgs = allImgs(out);
    // First image: still gets LCP treatment automatically.
    expect(imgs[0]).toContain('loading="eager"');
    // Second image with explicit eager: stays eager, fetchpriority is NOT
    // auto-added (the author wrote `loading="eager"` without it).
    expect(imgs[1]).toContain('loading="eager"');
    expect(imgs[1]).not.toContain("fetchpriority");
    // Both still get async decoding — universally safe.
    expect(imgs[1]).toContain('decoding="async"');
  });

  it('respects an explicit loading="lazy" attribute on the first image', async () => {
    const out = await runHtml(
      '<img src="/first.png" alt="first" loading="lazy" />'
    );
    const img = firstImg(out);
    // Author opted out of LCP — we honor it.
    expect(img).toContain('loading="lazy"');
    expect(img).not.toContain("fetchpriority");
    expect(img).toContain('decoding="async"');
  });

  it("opts images out via the data-no-lazy attribute", async () => {
    const out = await runHtml(
      '<img src="/a.png" alt="a" />' +
        '<img src="/b.png" alt="b" data-no-lazy="true" />' +
        '<img src="/c.png" alt="c" />'
    );
    const imgs = allImgs(out);
    expect(imgs[0]).toContain('loading="eager"');
    // The opted-out image: must NOT have loading/decoding set by us.
    expect(imgs[1]).not.toContain("loading=");
    expect(imgs[1]).not.toContain("decoding=");
    // Subsequent image after the skip: still gets lazy (LCP candidate is
    // already "consumed" by image #1).
    expect(imgs[2]).toContain('loading="lazy"');
  });

  it("opts images out via the .no-lazy class token", async () => {
    const out = await runHtml(
      '<img src="/a.png" alt="a" />' +
        '<img src="/b.png" alt="b" class="foo no-lazy bar" />'
    );
    const imgs = allImgs(out);
    expect(imgs[1]).not.toContain("loading=");
    expect(imgs[1]).not.toContain("decoding=");
  });

  it('opts any image into LCP treatment via data-lcp="true"', async () => {
    const out = await runHtml(
      '<img src="/first.png" alt="first" />' +
        '<img src="/hero.png" alt="hero" data-lcp="true" />' +
        '<img src="/third.png" alt="third" />'
    );
    const imgs = allImgs(out);
    // Second image, despite being position #2, wins LCP.
    expect(imgs[0]).toContain('loading="eager"'); // first by position
    expect(imgs[1]).toContain('loading="eager"'); // explicit data-lcp
    expect(imgs[1]).toContain('fetchpriority="high"');
    expect(imgs[2]).toContain('loading="lazy"');
  });

  // M23 (issues.md): the existing `data-lcp` test covers the
  // opt-in case but doesn't pin the SPECIFIC contract the issue
  // calls out — that an image *after* a `data-lcp` image, with no
  // other opt-out / opt-in, still receives the lazy default (NOT a
  // second LCP treatment). Regression cover for the LCP-consumes-
  // position invariant.
  it("M23: image after a data-lcp opt-in still receives the lazy default", async () => {
    const out = await runHtml(
      '<img src="/a.png" alt="a" data-lcp="true" />' +
        '<img src="/b.png" alt="b" />' +
        '<img src="/c.png" alt="c" />'
    );
    const imgs = allImgs(out);
    // The data-lcp image: LCP treatment.
    expect(imgs[0]).toContain('loading="eager"');
    expect(imgs[0]).toContain('fetchpriority="high"');
    // Subsequent images: lazy default — the LCP slot is consumed.
    expect(imgs[1]).toContain('loading="lazy"');
    expect(imgs[1]).toContain('decoding="async"');
    expect(imgs[1]).not.toContain("fetchpriority");
    expect(imgs[2]).toContain('loading="lazy"');
    expect(imgs[2]).toContain('decoding="async"');
    expect(imgs[2]).not.toContain("fetchpriority");
  });

  it("preserves an author-provided alt attribute verbatim", async () => {
    const out = await runMarkdown("![my hero shot](/hero.png)");
    const img = firstImg(out);
    expect(img).toContain('alt="my hero shot"');
  });

  it("does not touch non-img elements", async () => {
    const out = await runHtml(
      "<p>plain text</p>" +
        '<a href="/x"><img src="/link.png" alt="x" /></a>' +
        '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    );
    // The img inside <a> still gets the LCP treatment (it's the only img).
    expect(out).toContain('loading="eager"');
    // <p> and <a> and <svg> attributes must be untouched (no spurious
    // loading/decoding on them).
    expect(out).not.toMatch(/<p[^>]*loading=/);
    expect(out).not.toMatch(/<svg[^>]*loading=/);
  });

  it("propagates fetchpriority when the author set it without loading", async () => {
    const out = await runHtml(
      '<img src="/a.png" alt="a" />' +
        '<img src="/b.png" alt="b" fetchpriority="low" />'
    );
    const imgs = allImgs(out);
    // First is LCP by default.
    expect(imgs[0]).toContain('loading="eager"');
    expect(imgs[0]).toContain('fetchpriority="high"');
    // Second: fetchpriority preserved + lazy added.
    expect(imgs[1]).toContain('loading="lazy"');
    expect(imgs[1]).toContain('fetchpriority="low"');
  });

  it("can be configured to skip the first-image protection", async () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeLazyImages, { protectFirstImage: false })
      .use(rehypeStringify);
    const file = await processor.process("![a](/a.png)\n\n![b](/b.png)");
    const html = String(file);
    const imgs = allImgs(html);
    // Every image: lazy + async.
    expect(imgs[0]).toContain('loading="lazy"');
    expect(imgs[0]).not.toContain("fetchpriority");
    expect(imgs[1]).toContain('loading="lazy"');
  });
});
