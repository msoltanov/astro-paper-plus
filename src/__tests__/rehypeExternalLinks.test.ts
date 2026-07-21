import { describe, it, expect } from "vitest";
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeExternalLinks from "@/utils/rehypeExternalLinks";
import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot } from "hast";
import { __resetMalformedHrefWarningsForTesting as rehypeExternalLinksResetForTest } from "@/utils/rehypeExternalLinks";

/**
 * Run a markdown string through the production pipeline:
 * `remarkParse → remarkRehype → rehypeExternalLinks → rehypeStringify`.
 * Mirrors the real `.md`/`.mdx` build path so failures here would
 * mean real bugs at build time.
 */
async function runMarkdown(
  md: string,
  siteOrigin = "https://astro-paper-plus.pages.dev"
): Promise<string> {
  // The chain md → hast, so parse/head/compile trees are mdast for
  // the markdown half and hast for the HTML half — they need
  // separate type aliases.
  const processor: Processor<MdastRoot, MdastRoot, HastRoot, HastRoot, string> =
    unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeExternalLinks, { siteOrigin })
      .use(rehypeStringify);
  const file = await processor.process(md);
  return String(file);
}

/**
 * Run raw HTML through the plugin — exercises the path for `.mdx`
 * authors who write `<a>` tags directly. The markdown pipeline
 * preserves raw HTML, and the rehype walker still rewrites it.
 */
async function runHtml(
  html: string,
  siteOrigin = "https://astro-paper-plus.pages.dev"
): Promise<string> {
  const processor: Processor<HastRoot, HastRoot, HastRoot, HastRoot, string> =
    unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeExternalLinks, { siteOrigin })
      .use(rehypeStringify);
  const file = await processor.process(html);
  return String(file);
}

/** Pull every `<a>` element out of the output HTML. */
function allAnchors(html: string): string[] {
  return html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

/** Pull a single `<a>` element out of the output HTML. */
function firstAnchor(html: string): string | null {
  const m = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/);
  return m ? m[0] : null;
}

/** Extract an attribute value from an opening tag (returns null if
 * the attribute is missing or empty). We use a small regex rather
 * than a full HTML parser to keep test fixtures readable. */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

describe("rehypeExternalLinks", () => {
  it("rewrites absolute external links to target=_blank + rel=noopener noreferrer", async () => {
    const out = await runMarkdown("[example](https://example.com/post)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBe("_blank");
    expect(getAttr(a!, "rel")).toBe("noopener noreferrer");
  });

  it("preserves author-supplied rel tokens instead of clobbering them", async () => {
    // P1-15 regression. `rehype-parse` represents the space-separated
    // `rel` attribute as an ARRAY (`["sponsored","nofollow"]`), so a
    // `typeof rel === "string"` guard silently drops every author
    // token and emits a bare `rel="noopener noreferrer"`. Paid-link
    // disclosure vanishing from the output is an SEO/compliance bug,
    // so pin the composed order: author tokens first, then ours.
    const out = await runHtml(
      '<a href="https://example.com" rel="sponsored nofollow">x</a>'
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "rel")).toBe("sponsored nofollow noopener noreferrer");
  });

  it("does not duplicate rel tokens the author already supplied", async () => {
    const out = await runHtml(
      '<a href="https://example.com" rel="noopener sponsored">x</a>'
    );
    expect(getAttr(firstAnchor(out)!, "rel")).toBe(
      "noopener sponsored noreferrer"
    );
  });

  it("appends a visually-hidden (opens in new tab) span to external links", async () => {
    const out = await runMarkdown("[example](https://example.com/post)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    // Announcement is the LAST child of the anchor, appended (not
    // replacing) so screen readers still announce the original link
    // text first.
    expect(a!).toMatch(
      /<\/a>\s*$/ // sanity: close tag at end
    );
    expect(a!).toContain('<span class="sr-only"> (opens in new tab)</span>');
  });

  it("does NOT rewrite same-origin absolute URLs", async () => {
    const out = await runMarkdown(
      "[home](https://astro-paper-plus.pages.dev/about)"
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
    expect(getAttr(a!, "rel")).toBeNull();
    expect(a!).not.toContain("opens in new tab");
  });

  it("does NOT rewrite root-relative paths", async () => {
    const out = await runMarkdown("[about](/about)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
    expect(getAttr(a!, "rel")).toBeNull();
  });

  it("does NOT rewrite fragment-only anchors", async () => {
    const out = await runMarkdown("[jump](#section-2)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
    expect(getAttr(a!, "rel")).toBeNull();
  });

  it("does NOT rewrite mailto: links (they don't open tabs)", async () => {
    const out = await runMarkdown("[email](mailto:hi@example.com)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
    expect(getAttr(a!, "rel")).toBeNull();
    expect(a!).not.toContain("opens in new tab");
  });

  it("does NOT rewrite tel: links", async () => {
    const out = await runMarkdown("[call](tel:+99312000000)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
  });

  it("does NOT rewrite javascript: pseudo-protocol links", async () => {
    // Modern remark-rehype may drop `javascript:` URLs entirely for
    // safety, but if it lets one through we still must not add the
    // new-tab treatment.
    const out = await runMarkdown("[xss](javascript:alert(1))");
    const a = firstAnchor(out);
    if (a !== null) {
      expect(getAttr(a, "target")).toBeNull();
      expect(getAttr(a, "rel")).toBeNull();
    }
  });

  it("treats protocol-relative URLs as off-site when host differs", async () => {
    const out = await runMarkdown("[off-site](//other.com/post)");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBe("_blank");
  });

  it("treats protocol-relative URLs as same-site when host matches", async () => {
    const out = await runMarkdown(
      "[on-site](//astro-paper-plus.pages.dev/post)"
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
  });

  it("tolerates trailing-slash variants in siteOrigin", async () => {
    const withSlash = await runMarkdown(
      "[x](https://example.com/p)",
      "https://astro-paper-plus.pages.dev/"
    );
    const withoutSlash = await runMarkdown(
      "[x](https://example.com/p)",
      "https://astro-paper-plus.pages.dev"
    );
    // Same input, both should produce identical rewrites for external links.
    expect(withSlash).toBe(withoutSlash);
  });

  it("respects an explicit data-no-external opt-out", async () => {
    const out = await runHtml(
      '<a href="https://example.com/post" data-no-external="true">stay</a>'
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
    expect(getAttr(a!, "rel")).toBeNull();
    expect(a!).not.toContain("opens in new tab");
  });

  it("respects an explicit non-_blank target (author's choice wins)", async () => {
    const out = await runHtml(
      '<a href="https://example.com/post" target="my-iframe">iframe</a>'
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    // Author-set target is preserved verbatim — we do not overwrite it.
    expect(getAttr(a!, "target")).toBe("my-iframe");
    // And we do NOT add the (opens in new tab) announcement, because
    // the link is NOT going to a new tab.
    expect(a!).not.toContain("opens in new tab");
  });

  it("overrides an explicit _blank target by ADDING rel (idempotent)", async () => {
    // Author wrote `target=_blank` but forgot the rel. We add the
    // security attributes; we don't strip the target they wrote.
    const out = await runHtml(
      '<a href="https://example.com/post" target="_blank">cite</a>'
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBe("_blank");
    expect(getAttr(a!, "rel")).toBe("noopener noreferrer");
  });

  it("leaves anchors without href alone", async () => {
    const out = await runHtml("<a>no href</a>");
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBeNull();
    expect(a!).not.toContain("opens in new tab");
  });

  it("does not crash on malformed URLs (rewrites as external + warns)", async () => {
    // Hand-built AST with a deliberately bad URL. We rely on the
    // plugin's try/catch + the rehype pipeline to NOT throw at build.
    //
    // M — the previous "leave alone" behaviour silently stripped the
    // WCAG "(opens in new tab)" announcement from exactly the links
    // that need it most. The fix: malformed URLs are treated as
    // external (target=_blank + rel + sr-only span) and a one-shot
    // dev-mode console.warn is emitted. Authors still see the failing
    // link in a new tab where the Back button survives.
    const out = await runHtml('<a href="https://[invalid">bad</a>');
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBe("_blank");
    expect(getAttr(a!, "rel")).toMatch(/noopener/);
    expect(a!).toContain("opens in new tab");
  });

  // M — issues.md #4: the malformed-href warning must include the
  // VFile path so an author can trace the noisy build log back to
  // the specific `.md` / `.mdx` that produced the bad link.
  it("M: malformed-href warning tags the source VFile path", async () => {
    const { VFile } = await import("vfile");
    const warnings: string[] = [];
    /* eslint-disable no-console -- test fixture swaps the warn sink to
     * capture the warning output; this is the only legitimate
     * `console.*` touchpoint in the suite. */
    const originalWarn = console.warn;
    console.warn = (msg: string) => {
      warnings.push(msg);
    };
    try {
      // Reset BEFORE the process call: a prior malformed-href test
      // in this file may have already added the same literal to the
      // dedupe set, which would silently swallow our warning.
      rehypeExternalLinksResetForTest();
      const processor = unified()
        .use(rehypeParse, { fragment: true })
        .use(rehypeExternalLinks, {
          siteOrigin: "https://astro-paper-plus.pages.dev",
        })
        .use(rehypeStringify);
      const file = new VFile({
        value: '<a href="https://[invalid">bad</a>',
        path: "src/content/posts/ru/2026/my-post.md",
      });
      await processor.process(file);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("malformed href");
      expect(warnings[0]).toContain("src/content/posts/ru/2026/my-post.md");
    } finally {
      console.warn = originalWarn;
    }
    /* eslint-enable no-console */
  });

  it("rewrites multiple external links in the same document independently", async () => {
    const out = await runMarkdown(
      "[a](https://a.com/x) and [b](https://b.com/y) and [local](/about)"
    );
    const anchors = allAnchors(out);
    expect(anchors).toHaveLength(3);
    expect(getAttr(anchors[0], "target")).toBe("_blank");
    expect(getAttr(anchors[1], "target")).toBe("_blank");
    expect(getAttr(anchors[2], "target")).toBeNull();
  });

  it("preserves author-provided attributes (class, id, title, aria-*)", async () => {
    const out = await runHtml(
      '<a href="https://example.com/post" class="footnote" id="fn1" title="source" aria-describedby="fn1-note">cite</a>'
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(getAttr(a!, "target")).toBe("_blank");
    expect(getAttr(a!, "rel")).toBe("noopener noreferrer");
    expect(getAttr(a!, "class")).toBe("footnote");
    expect(getAttr(a!, "id")).toBe("fn1");
    expect(getAttr(a!, "title")).toBe("source");
    expect(getAttr(a!, "aria-describedby")).toBe("fn1-note");
  });

  it("preserves the original link text content", async () => {
    const out = await runMarkdown(
      "[the *quick* brown fox](https://example.com)"
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    expect(a!).toContain("the");
    expect(a!).toContain("quick");
    expect(a!).toContain("brown");
    expect(a!).toContain("fox");
  });

  it("appends only ONE announcement span even if the link has many children", async () => {
    const out = await runHtml(
      '<a href="https://example.com/post"><strong>bold</strong> and <em>italic</em></a>'
    );
    const a = firstAnchor(out);
    expect(a).not.toBeNull();
    const matches = a!.match(/<span class="sr-only">/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe("rehypeExternalLinks — locale-aware announcements", () => {
  /**
   * Run raw HTML through the plugin with a synthetic `file.path`
   * matching the locale-segment shape the plugin's `localeFromFilePath`
   * expects (`/<posts|pages>/<locale>/...`). Mirrors how Astro's
   * markdown pipeline threads `file.path` through the plugin chain.
   *
   * Implementation note: we attach `path` to the file BEFORE
   * processing so the plugin's `localeFromFilePath` resolves it
   * during its visit pass. The unified processor accepts a vfile
   * that we can pre-populate via the second argument to `process()`.
   */
  async function runWithFilePath(
    html: string,
    filePath: string,
    translationsByLocale: Record<string, { opensInNewTab: string }>
  ): Promise<string> {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeExternalLinks, {
        siteOrigin: "https://astro-paper-plus.pages.dev",
        translationsByLocale,
      })
      .use(rehypeStringify);
    // Pre-populate the vfile's `path` so the plugin reads the right
    // locale during processing. unified's `process()` accepts an
    // existing VFile as its second argument.
    const { VFile } = await import("vfile");
    const file = new VFile({ value: html, path: filePath });
    const processed = await processor.process(file);
    return String(processed);
  }

  it("uses the Russian announcement for /ru/ posts", async () => {
    const out = await runWithFilePath(
      '<a href="https://example.com/post">cite</a>',
      "src/content/posts/ru/2026/x.md",
      {
        en: { opensInNewTab: "opens in new tab" },
        ru: { opensInNewTab: "открывается в новой вкладке" },
      }
    );
    expect(out).toContain("(открывается в новой вкладке)");
    expect(out).not.toContain("opens in new tab");
  });

  it("uses the Turkish announcement for /tr/ posts", async () => {
    const out = await runWithFilePath(
      '<a href="https://example.com/post">cite</a>',
      "src/content/posts/tr/2026/x.md",
      {
        en: { opensInNewTab: "opens in new tab" },
        tr: { opensInNewTab: "yeni sekmede açılır" },
      }
    );
    expect(out).toContain("(yeni sekmede açılır)");
  });

  it("falls back to English when the file path has no locale segment", async () => {
    const out = await runWithFilePath(
      '<a href="https://example.com/post">cite</a>',
      "src/content/pages/about.md",
      {
        en: { opensInNewTab: "opens in new tab" },
      }
    );
    expect(out).toContain("(opens in new tab)");
  });

  it("falls back to English when the locale isn't in the translations map", async () => {
    const out = await runWithFilePath(
      '<a href="https://example.com/post">cite</a>',
      "src/content/posts/es/2026/x.md",
      {
        en: { opensInNewTab: "opens in new tab" },
      }
    );
    expect(out).toContain("(opens in new tab)");
  });
});
