/**
 * Behavioural contract for `src/utils/sanitizeRssDescription.ts`.
 *
 * The helper feeds `@astrojs/rss`, which in turn routes values
 * through `fast-xml-parser`'s `XMLBuilder`. The builder entity-encodes
 * `<`, `>`, `&`, and `"` for every text node it emits — which means
 * any escaping `sanitizeRssDescription` does is on TOP of the
 * serializer's own pass. Pre-escaping was a long-standing bug: the
 * produced feed shipped `&amp;amp;` / `&amp;lt;` / `&amp;gt;` and
 * readers rendered the entities literally.
 *
 * The contract pinned by these tests:
 *
 *   - Plain prose (`&`, `<`, `>`) passes through unchanged. The
 *     serializer does the one-and-only entity-encoding pass.
 *   - Sparse HTML (`<a href="...">label</a>`) survives verbatim so the
 *     serializer can emit `&lt;a href=&quot;…&quot;&gt;label&lt;/a&gt;`
 *     which RSS readers parse back into a real anchor.
 *   - `<a>` whose `href` is `javascript:` / `data:` / `vbscript:` has
 *     its `href` attribute stripped (the visible label is preserved)
 *     so a reader has nothing to follow. This is the sanitiser half
 *     of the contract — the only thing `sanitizeRssDescription` does
 *     on top of the serializer.
 */
import { describe, it, expect } from "vitest";
import { sanitizeRssDescription } from "@/utils/sanitizeRssDescription";

describe("sanitizeRssDescription", () => {
  it("returns plain prose unchanged (no double-escaping by the helper)", () => {
    // Regression: previously this returned
    // "plain text &amp; &lt; &gt;" and the XML serializer then escaped
    // the `&` once more, producing `&amp;amp; &amp;lt; &amp;gt;` in
    // the rendered feed. The fix drops the helper's internal escape
    // pass; the serializer does it once.
    const input = "plain text with & < > characters";
    expect(sanitizeRssDescription(input)).toBe(input);
  });

  it("preserves benign anchor tags verbatim", () => {
    // The XML serializer turns the literal `<` / `>` / `"` into
    // `&lt;` / `&gt;` / `&quot;` on the way out; readers render the
    // result as a clickable anchor.
    const input = 'read <a href="https://example.com">here</a> please';
    expect(sanitizeRssDescription(input)).toBe(input);
  });

  it("strips the href attribute from javascript: anchors but keeps the label", () => {
    // The serializer would faithfully emit
    // `<a href="javascript:...">...</a>`, which some readers execute.
    // We hand back an `<a>` with no href so it's harmless.
    const input = '<a href="javascript:alert(1)">click me</a>';
    expect(sanitizeRssDescription(input)).toBe("<a>click me</a>");
  });

  it("matches javascript: case-insensitively and tolerates leading whitespace", () => {
    expect(
      sanitizeRssDescription('<a href="  JaVaScRiPt:alert(1)">x</a>')
    ).toBe("<a>x</a>");
  });

  it("strips data: and vbscript: anchors", () => {
    expect(sanitizeRssDescription('<a href="data:text/html,evil">x</a>')).toBe(
      "<a>x</a>"
    );
    expect(sanitizeRssDescription('<a href="vbscript:msgbox(1)">x</a>')).toBe(
      "<a>x</a>"
    );
  });

  it("preserves single-quoted hrefs and keeps only href (+ title) on benign anchors", () => {
    // R7: the previous shape passed `before` / `after` through
    // verbatim, so `target` / `rel` / `onclick` / `style` / `class`
    // survived into the feed. Feed readers render the description as
    // HTML, so a surviving inline event handler would execute. The
    // fix rebuilds the anchor from scratch with only `href` (and an
    // optional `title`); `target` and `rel` are dropped — they're
    // either inherent to the feed renderer or unnecessary.
    const input =
      '<a target="_blank" rel="noopener" title="example site" href=\'https://example.com\'>label</a>';
    expect(sanitizeRssDescription(input)).toBe(
      '<a href="https://example.com" title="example site">label</a>'
    );
  });

  it("R7: drops inline event handlers even when the href is safe", () => {
    // A future contributor who copies a raw `<a>` tag from a markdown
    // body (which postDescription leaves intact inline) would
    // otherwise see `onclick` reach the feed. Whitelist `href` (and
    // `title`) so inline handlers can't leak.
    const input = '<a href="https://example.com" onclick="alert(1)">x</a>';
    expect(sanitizeRssDescription(input)).toBe(
      '<a href="https://example.com">x</a>'
    );
  });

  it("P3: preserves apostrophes inside a double-quoted title attribute", () => {
    // Regression: the previous shape used `[^"']*` to read the title
    // content, which excluded both quote characters — a valid
    // double-quoted title with an apostrophe (`title="Alice's site"`)
    // failed to match and the title was silently dropped from the
    // feed. The lookahead-at-each-char pattern `(?!\1).` excludes
    // only the matching delimiter, so the apostrophe survives
    // unchanged (and the symmetric single-quoted case rejects raw
    // apostrophes in the content, which is invalid HTML anyway).
    const input =
      '<a href="https://example.com" title="Alice\'s site">label</a>';
    expect(sanitizeRssDescription(input)).toBe(
      '<a href="https://example.com" title="Alice\'s site">label</a>'
    );
  });

  it("strips handlers from anchors without href", () => {
    expect(sanitizeRssDescription('<a onclick="alert(1)">x</a>')).toBe(
      "<a>x</a>"
    );
  });

  it("accepts safe unquoted hrefs and rejects dangerous unquoted hrefs", () => {
    expect(sanitizeRssDescription("<a href=https://example.com>x</a>")).toBe(
      '<a href="https://example.com">x</a>'
    );
    expect(sanitizeRssDescription("<a href=javascript:alert(1)>x</a>")).toBe(
      "<a>x</a>"
    );
  });

  it("rejects dangerous schemes hidden behind ASCII controls", () => {
    expect(
      sanitizeRssDescription('<a href="java\u0000script:alert(1)">x</a>')
    ).toBe("<a>x</a>");
  });

  it("allows relative and whitelisted absolute hrefs", () => {
    for (const href of [
      "#section",
      "/posts/example/",
      "./relative",
      "https://example.com",
      "mailto:test@example.com",
      "tel:+1234",
      "ftp://example.com/file",
    ]) {
      expect(sanitizeRssDescription(`<a href="${href}">x</a>`)).toBe(
        `<a href="${href}">x</a>`
      );
    }
  });

  it("leaves prose that contains literal `<` or `>` untouched (for the serializer to escape once)", () => {
    // Common in math-y prose: `0 < x < 10`. The helper MUST NOT
    // escape here — that's the serializer's job.
    const input = "use it when 0 < x < 10 and 5 > y";
    expect(sanitizeRssDescription(input)).toBe(input);
  });
});
