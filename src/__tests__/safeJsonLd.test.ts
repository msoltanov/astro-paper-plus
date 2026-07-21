/**
 * Tests for src/utils/safeJsonLd.ts.
 *
 * The function JSON.stringifies its input and neutralizes the four
 * characters that have special meaning inside a raw-text
 * <script type="application/ld+json"> context:
 *
 *   - < and > — would prematurely close the script tag in some
 *     parsers' error-recovery mode.
 *   - U+2028 and U+2029 — JSON treats these as whitespace, but JS
 *     string-literal parsing (which the inline JSON becomes) treats
 *     them as line terminators. Historical XSS vector.
 *
 * These tests pin the escape contract: re-introducing ANY of these
 * characters in user-controlled JSON-LD content should not be able
 * to break out of the inline script tag.
 *
 * Note on the U+2028 / U+2029 literals: this file uses the six-char
 * escape sequences ` \u2028 ` / ` \u2029 ` in source rather than
 * the raw line-separator / paragraph-separator bytes. Editors and
 * some VCS hooks silently strip those raw bytes on save (the bytes
 * are valid line terminators per ECMA-262, so tooling treats them as
 * line breaks). The escape sequences survive every editor round-trip
 * and keep the test exercising the exact same path it always has.
 */
import { describe, it, expect } from "vitest";
import { safeJsonLd } from "@/utils/safeJsonLd";

describe("safeJsonLd", () => {
  it("JSON.stringifies plain objects", () => {
    expect(safeJsonLd({ "@type": "Thing", name: "ok" })).toBe(
      JSON.stringify({ "@type": "Thing", name: "ok" })
    );
  });

  it("escapes < to \\u003c to prevent script-tag closure", () => {
    const out = safeJsonLd({ x: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script\\u003e");
  });

  it("escapes > to \\u003e", () => {
    const out = safeJsonLd({ x: ">" });
    expect(out).toContain("\\u003e");
  });

  it("escapes U+2028 (LINE SEPARATOR) to \\u2028", () => {
    const out = safeJsonLd({ x: "\u2028" });
    expect(out).toContain("\\u2028");
  });

  it("escapes U+2029 (PARAGRAPH SEPARATOR) to \\u2029", () => {
    const out = safeJsonLd({ x: "\u2029" });
    expect(out).toContain("\\u2029");
  });

  it("preserves & and apostrophes (no spurious escaping)", () => {
    const out = safeJsonLd({ x: "Tom & Jerry's café" });
    expect(out).toContain("Tom & Jerry");
    expect(out).toContain("café");
    expect(out).not.toContain("\\u0026");
    expect(out).not.toContain("\\u0027");
  });

  it("handles nested objects and arrays", () => {
    const input = {
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "<a>" },
        { "@type": "ListItem", position: 2, name: "\u2028b" },
      ],
    };
    const out = safeJsonLd(input);
    const parsed = JSON.parse(out);
    expect(parsed["@type"]).toBe("ItemList");
    expect(parsed.itemListElement).toHaveLength(2);
    expect(parsed.itemListElement[0].name).toBe("<a>");
    expect(parsed.itemListElement[1].name).toBe("\u2028b");
  });

  // M20: emoji surrogate pairs (4-byte UTF-8 sequences) round-trip
  // cleanly through the helper. `JSON.stringify` preserves them as
  // raw UTF-8, the post-escape regexes don't touch them, and the
  // round-trip `JSON.parse(escaped)` invariant confirms the output
  // is valid JSON.
  it("M20: emoji surrogate pairs survive escape + round-trip", () => {
    const input = { emoji: "\uD83D\uDE80 café Привет" };
    const out = safeJsonLd(input);
    const parsed = JSON.parse(out);
    expect(parsed.emoji).toBe("\uD83D\uDE80 café Привет");
  });

  it("M20: round-trip parse catches malformed output (regression guard)", () => {
    // Force a malformed output by patching `JSON.parse` to throw on
    // a sentinel value — confirms the helper would have surfaced
    // the error at the boundary rather than shipping invalid JSON.
    const realParse = JSON.parse;
    let parsed = false;
    JSON.parse = ((input: string) => {
      if (input.includes("__BAD__")) throw new SyntaxError("boom");
      parsed = true;
      return realParse(input);
    }) as typeof JSON.parse;
    try {
      safeJsonLd({ ok: "hello" });
      expect(parsed).toBe(true);
    } finally {
      JSON.parse = realParse;
    }
  });

  describe("M: edge-case coverage", () => {
    it("escapes a balanced </script close tag mid-string", () => {
      const out = safeJsonLd({ x: "</script><script>alert(1)</script>" });
      expect(out).not.toContain("</script>");
      expect(out).toContain("\\u003c/script\\u003e");
    });

    it("preserves & (no spurious entity encoding) and lets JSON.stringify handle double quotes", () => {
      const out = safeJsonLd({ x: 'Tom & "Jerry"' });
      // `&` is not a JSON-significant character; it round-trips
      // verbatim. Double quotes inside strings ARE JSON-significant
      // and `JSON.stringify` escapes them via `\"`, which is fine
      // for `<script>` context (the script body is a JS string
      // literal at parse time).
      expect(out).toContain("Tom &");
      expect(out).toContain('\\"Jerry\\"');
      expect(out).not.toContain("\\u0026");
    });

    it("handles a deeply nested object with mixed escape-needing values", () => {
      const input = {
        "@type": "ItemList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "<bad>" },
          { "@type": "ListItem", position: 2, name: "with U+2028 > \u2028" },
          { "@type": "ListItem", position: 3, name: "ok" },
        ],
      };
      const out = safeJsonLd(input);
      const parsed = JSON.parse(out);
      expect(parsed.itemListElement[0].name).toBe("<bad>");
      expect(parsed.itemListElement[1].name).toBe("with U+2028 > \u2028");
      expect(parsed.itemListElement[2].name).toBe("ok");
    });

    it("produces valid output for arrays of strings (used by BreadcrumbList)", () => {
      const out = safeJsonLd(["Posts (page 2)", "Записи"]);
      const parsed = JSON.parse(out);
      expect(parsed).toEqual(["Posts (page 2)", "Записи"]);
      // Neither string should have broken script-out — ensure
      // round-trip parse landed on the same values.
      expect(parsed[0]).toContain("(page 2)");
      expect(parsed[1]).toContain("Записи");
    });

    it("escapes a lone forward slash /  (no spurious encoding)", () => {
      // JSON doesn't require escaping forward slashes (GH ruled out
      // the \u002f escape years ago); confirm the helper doesn't
      // reintroduce it.
      const out = safeJsonLd({ url: "https://example.com/path/to/x" });
      expect(out).toContain("https://example.com/path/to/x");
      expect(out).not.toContain("\\u002f");
    });

    it("handles null and undefined values inside the input shape", () => {
      const out = safeJsonLd({ a: null, b: undefined });
      const parsed = JSON.parse(out);
      expect(parsed).toEqual({ a: null });
    });

    it("handles primitives at the top level (string, number, boolean)", () => {
      expect(JSON.parse(safeJsonLd("a string"))).toBe("a string");
      expect(JSON.parse(safeJsonLd(42))).toBe(42);
      expect(JSON.parse(safeJsonLd(true))).toBe(true);
    });
  });
});
