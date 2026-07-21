import kebabcase from "lodash.kebabcase";
import slugify from "slugify";

// L1: route through the Unicode-script-aware detector rather than the
// ASCII-only `[^\x00-\x7F]` check. The previous matcher classified
// Latin extended / Latin-with-diacritics ("café", "Türkçe", "naïve")
// as non-Latin and sent them through `lodash.kebabcase`, which keeps
// the diacritics verbatim. The Unicode-property matcher recognises
// every Latin-script codepoint (Basic Latin, Latin-1 Supplement,
// Latin Extended-A/B, …) as Latin and lowercases / hyphenates it via
// `slugify()` like any other Latin input. Non-Latin scripts
// (Cyrillic, Greek, Han, Hiragana, …) still go through kebabcase to
// preserve their glyphs in the URL.
const hasNonLatinScript = (str: string): boolean => {
  // `\p{Script=Latin}` matches any Latin-script letter; combined with
  // `\p{N}` (any number) and `\p{P}` / `\p{Z}` (punctuation + space).
  // An input that contains ONLY those classes is treated as Latin.
  return !/^[\p{Script=Latin}\p{N}\p{P}\p{Z}]*$/u.test(str);
};

/**
 * Slugify a string using a hybrid approach:
 * - Latin-script strings: slugify (e.g. "E2E Testing" → "e2e-testing",
 *   "Café" → "cafe", "Türkçe" → "turkce")
 * - Strings with non-Latin scripts: lodash.kebabcase (preserves the
 *   script's glyphs in the URL — e.g. "Привет" → "привет").
 */
export const slugifyStr = (str: string): string => {
  if (hasNonLatinScript(str)) {
    return kebabcase(str);
  }
  return slugify(str, { lower: true });
};

/**
 * Apply `slugifyStr` to every entry in an array.
 *
 * Public API — exported because the upstream AstroPaper theme ships
 * this helper, and downstream forks / themes (and any user-written
 * helpers over `slugifyStr`) call it. Keep the contract: same
 * per-element behavior as `slugifyStr`, no surprises on edge inputs.
 */
export const slugifyAll = (arr: string[]) => arr.map(str => slugifyStr(str));
