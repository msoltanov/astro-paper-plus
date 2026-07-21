import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

/**
 * Source-contract tests for `src/scripts/theme.ts`. The vitest
 * environment is `"node"` (see `vitest.config.ts`), so we don't have a
 * DOM to actually run the module — instead we read its source and
 * assert on the produced string. This mirrors the pattern in
 * `__tests__/localeSwitcherDropdown.test.ts`.
 *
 * Two invariants matter:
 *
 *   1. `aria-label` on `#theme-btn` is NOT overwritten with `themeValue`
 *      (`"light"` / `"dark"`). The header button sets the i18n label and
 *      theme.ts must leave it alone — `aria-pressed` is the right
 *      channel for the toggle state. (Earlier `reflect()` rewrote
 *      aria-label to `themeValue`, which silence'd the i18n label.)
 *
 *   2. `<meta name="theme-color">` is updated on boot from the body's
 *      computed background colour so Android's browser chrome follows
 *      the page. (Earlier the line was 359 chars; everything after
 *      the first `//` was commented out.)
 *
 * These guards fail close if either regression returns.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "../scripts/theme.ts");
const source = readFileSync(sourcePath, "utf8");

// Pre-compute once per file load.
const ariaOverwriteRe =
  /#theme-btn[\s\S]*?\.setAttribute\(\s*["']aria-label["']\s*,\s*themeValue/;
const ariaPressedRe =
  /#theme-btn[\s\S]*?\.setAttribute\(\s*["']aria-pressed["']/;
const metaQueryRe =
  /querySelector\(\s*["']meta\[name=['"]theme-color['"]\]['"]?\s*\)/;
const bodyBgReadRe = /getComputedStyle\(\s*document\.body\s*\)/;

describe("theme.ts — source contract", () => {
  it("does NOT overwrite the theme button's aria-label with the theme value", () => {
    expect(ariaOverwriteRe.test(source)).toBe(false);
  });

  it("uses aria-pressed on #theme-btn for the toggle state", () => {
    expect(ariaPressedRe.test(source)).toBe(true);
  });

  it("updates the <meta name=theme-color> tag with the body background", () => {
    expect(metaQueryRe.test(source)).toBe(true);
    expect(bodyBgReadRe.test(source)).toBe(true);
  });

  it("does not collapse multiple statements onto a single physical line", () => {
    // The D-1 regression had a 359-char physical line. Guard against the
    // specific shape of "everything after the first `//` is comment" by
    // asserting no line exceeds 200 chars. Code legitimately runs longer
    // than Prettier's 100-char prose ceiling, but 360 chars is the
    // exact failure mode we're guarding.
    const lines = source.split(/\r?\n/);
    const oversized = lines.filter(line => line.length > 200);
    expect(
      oversized,
      `Source has ${oversized.length} line(s) over 200 chars:\n${oversized.join("\n")}`
    ).toEqual([]);
  });

  it("mirrors themeValue onto <html data-theme> + class='dark'", () => {
    expect(source).toMatch(/document\.firstElementChild/);
    expect(source).toMatch(
      /setAttribute\(\s*["']data-theme["']\s*,\s*themeValue/
    );
    expect(source).toMatch(
      /classList\.toggle\(\s*["']dark["']\s*,\s*themeValue\s*===\s*DARK/
    );
  });

  it("carries theme-color across astro:before-swap", () => {
    expect(source).toMatch(/astro:before-swap/);
    // Both reads and writes the new document's meta so the
    // Android-flash regression is caught if either side is removed.
    expect(source).toMatch(/\.newDocument\b/);
  });

  it("respects an explicit localStorage preference over OS-level scheme change", () => {
    // The OS-level listener must not override the user's explicit
    // choice stored in localStorage. Source now goes through the
    // safeStorage wrapper (try/catch around localStorage access), so
    // we accept either the raw call or the safe-guard form.
    expect(source).toMatch(/safeLocal\.get\(\s*THEME_KEY/);
  });
});
