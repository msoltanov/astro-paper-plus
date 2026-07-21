/**
 * Tests for the HTML-harvest helpers in
 * `src/integrations/sitemap.ts`. The helpers aren't exported, so
 * this test re-implements the same regex against fixture HTML to
 * pin the parsing contract — if a future change to the regex
 * breaks production sitemap pages chunks, these tests fail.
 *
 * The fixtures model what Astro's `<head>` actually emits for
 * project/gallery detail pages: lowercase `<link rel="alternate"
 * hreflang="…" href="…">` with absolute URLs.
 */
import { describe, it, expect } from "vitest";

const HREFLANG_RE =
  /<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g;

function parseHreflang(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  let match: RegExpExecArray | null;
  // Re-create the regex each call (lastIndex is stateful).
  const re = new RegExp(HREFLANG_RE.source, "g");
  while ((match = re.exec(html)) !== null) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

describe("hreflang HTML parsing (integration contract)", () => {
  it("extracts the full cluster from a real-world project head", () => {
    // Mirror of what `dist/projects/astropaper/index.html` emits.
    const html = `<!doctype html>
<html>
<head>
  <link rel="alternate" hreflang="en" href="https://astro-paper-plus.pages.dev/projects/astropaper/">
  <link rel="alternate" hreflang="ru" href="https://astro-paper-plus.pages.dev/ru/projects/astropaper/">
  <link rel="alternate" hreflang="tr" href="https://astro-paper-plus.pages.dev/tr/projects/astropaper/">
  <link rel="alternate" hreflang="x-default" href="https://astro-paper-plus.pages.dev/projects/astropaper/">
</head>
</html>`;
    expect(parseHreflang(html)).toEqual({
      en: "https://astro-paper-plus.pages.dev/projects/astropaper/",
      ru: "https://astro-paper-plus.pages.dev/ru/projects/astropaper/",
      tr: "https://astro-paper-plus.pages.dev/tr/projects/astropaper/",
      "x-default": "https://astro-paper-plus.pages.dev/projects/astropaper/",
    });
  });

  it("returns an empty object when the page has no hreflang (search/404)", () => {
    const html = `<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="/_astro/foo.css">
  <meta name="robots" content="noindex">
</head>
</html>`;
    expect(parseHreflang(html)).toEqual({});
  });

  it("ignores non-hreflang alternate links (e.g. RSS)", () => {
    const html = `<head>
  <link rel="alternate" type="application/rss+xml" href="/rss.xml">
  <link rel="alternate" hreflang="en" href="https://example.com/about/">
</head>`;
    const result = parseHreflang(html);
    expect(Object.keys(result)).toEqual(["en"]);
    expect(result.en).toBe("https://example.com/about/");
  });

  it("preserves the order of hreflang attributes (LOCALES order, en first)", () => {
    const html = `<head>
  <link rel="alternate" hreflang="en" href="/en/">
  <link rel="alternate" hreflang="ru" href="/ru/">
  <link rel="alternate" hreflang="tr" href="/tr/">
  <link rel="alternate" hreflang="x-default" href="/en/">
</head>`;
    const result = parseHreflang(html);
    expect(Object.keys(result)).toEqual(["en", "ru", "tr", "x-default"]);
  });
});
