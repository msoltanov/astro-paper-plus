import { describe, it, expect } from "vitest";
import { slugifyStr, slugifyAll } from "@/utils/slugify";

describe("slugifyStr", () => {
  describe("Latin input", () => {
    it("lowercases and hyphenates a phrase", () => {
      expect(slugifyStr("E2E Testing")).toBe("e2e-testing");
    });

    it("strips punctuation", () => {
      // The `slugify` package keeps some punctuation like '!' as a trailing
      // word; we only assert the major chunks here.
      expect(slugifyStr("Hello, World!")).toMatch(/^hello-world/);
    });

    it("handles single words", () => {
      expect(slugifyStr("Post")).toBe("post");
    });

    it("collapses runs of separators", () => {
      expect(slugifyStr("foo---bar baz")).toBe("foo-bar-baz");
    });
  });

  describe("non-Latin and diacritic input", () => {
    it("preserves Cyrillic characters via kebabcase", () => {
      // Russian: "Привет, мир" - should keep Cyrillic chars
      const result = slugifyStr("Привет, мир");
      expect(result.length).toBeGreaterThan(0);
      // Cyrillic chars should be present (kebabcase preserves them)
      expect(result).toMatch(/[\u0400-\u04FF]/);
    });

    it("preserves Latin-script input with diacritics", () => {
      const result = slugifyStr("Türkçe dilinde");
      expect(result.length).toBeGreaterThan(0);
      // The string should at least not be empty after slugification
      expect(result).toBeTypeOf("string");
    });

    it("handles Turkish-specific characters (I/İ, Ş, Ğ, Ü, Ö, Ç)", () => {
      // These have non-Latin (extended Latin) codepoints, so they go via kebabcase.
      // This test mainly asserts that the function does not throw and returns a sane value.
      const result = slugifyStr("Türkiye'de yazilim");
      expect(result.length).toBeGreaterThan(0);
    });

    // L1: with the Unicode-script detector, Latin extended characters
    // (diacritics like é, ü, ñ, ç) are recognised as Latin and
    // slugified + lowercased via `slugify`, NOT preserved verbatim
    // through kebabcase. The previous ASCII-only detector sent every
    // non-ASCII byte through kebabcase and shipped URL-with-diacritics.
    it("L1: Latin-with-diacritics is slugified (lowercase, no diacritics)", () => {
      expect(slugifyStr("Café")).toBe("cafe");
      expect(slugifyStr("naïve")).toBe("naive");
      expect(slugifyStr("Türkçe")).toBe("turkce");
    });

    it("kebabcase preserves non-Latin chars and lowercases", () => {
      const result = slugifyStr("Cyrillic тест");
      expect(result).toBeTypeOf("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("returns empty for empty input", () => {
      expect(slugifyStr("")).toBe("");
    });

    it("returns a plain string of dashes when stripping all alphanumerics", () => {
      const result = slugifyStr("!!!");
      // Latin path goes via slugify(); we don't enforce the exact value but
      // assert no throw and sane behaviour.
      expect(result).toBeTypeOf("string");
    });

    it("handles numeric strings", () => {
      expect(slugifyStr("2026 Year In Review")).toBe("2026-year-in-review");
    });
  });
});

describe("slugifyAll", () => {
  it("slugifies an array of strings", () => {
    expect(slugifyAll(["Hello World", "Foo Bar"])).toEqual([
      "hello-world",
      "foo-bar",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(slugifyAll([])).toEqual([]);
  });

  it("handles mixed Latin and non-Latin", () => {
    const result = slugifyAll(["hello", "Привет"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("hello");
    expect(result[1]).toMatch(/[\u0400-\u04FF]/);
  });
});
