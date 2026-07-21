/**
 * Single source of truth for the pre-paint `<meta name="theme-color">`
 * literals. The values mirror the CSS variables `--background` in
 * `src/styles/theme.css` and are inlined into the FOUC-prevention
 * script in `src/layouts/Layout.astro` so the browser chrome colour
 * (Android nav bar, iOS status bar tint, …) matches the page
 * background on the very first paint — before CSS variables resolve
 * and before the body has a computed background colour.
 *
 * Why this lives in TypeScript:
 * - The CSS file is the source of truth for the *rendered* background.
 * - The inline FOUC script can't read the CSS variable (it runs before
 *   the body computes its background), so it needs literals.
 * - Keeping a TS constant means a future theme change updates one
 *   place and the CSS test (`themeColorTokens.test.ts`) catches any
 *   drift between the CSS source and these literals.
 *
 * Loaded via Vite's `?raw` import so the CSS is inlined into the
 * bundle at build time — no `fs.readFileSync` in Astro's prerender
 * bundle, where `process.cwd()` is `dist/.prerender/` and a relative
 * `fs.readFile` would 404 because the source CSS isn't copied there.
 *
 * A `node:fs` fallback reads the source if the `?raw` import returns
 * empty — that happens under vitest, where Vite's dev-mode CSS
 * pipeline hands back an empty string for unprocessed `.css` files.
 * The fallback uses `import.meta.url` to resolve relative to the
 * module file, so it works regardless of cwd in dev / test environments.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import themeCssRaw from "../styles/theme.css?raw";

const themeCss = loadThemeCss(themeCssRaw);

function loadThemeCss(raw: string): string {
  if (raw && raw.length > 0) return raw;
  const fallbackPath = fileURLToPath(
    new URL("../styles/theme.css", import.meta.url)
  );
  return readFileSync(fallbackPath, "utf8");
}

/**
 * Canonical light-selector literal from `src/styles/theme.css`. The
 * actual rule is the comma-grouped `:root, [data-theme="light"] { … }`;
 * matching both literals individually with `indexOf` is order-
 * sensitive (the FIRST `:root,` hit would win if a future contributor
 * added another `:root,` rule earlier in the file). Anchoring on the
 * full selector pair is unambiguous regardless of CSS reordering.
 *
 * The dark selector `[data-theme="dark"]` is unique on its own (no
 * other rule in the file uses it), so a plain `indexOf` lookup is
 * safe there.
 */
const LIGHT_SELECTOR = ":root,";
const LIGHT_SELECTOR_ALT = '[data-theme="light"]';

function findLightBlock(stripped: string): string {
  // Prefer the canonical paired selector; fall back to the `[data-theme="light"]`
  // half if the pairing was ever split into two rules.
  let idx = stripped.indexOf(LIGHT_SELECTOR + "\n" + LIGHT_SELECTOR_ALT);
  if (idx < 0) idx = stripped.indexOf(LIGHT_SELECTOR_ALT);
  return extractBlockBody(stripped, idx) ?? "";
}

/**
 * Light + dark `--background` literals, read from the inlined
 * `theme.css`. Surfaced as a const export so tests can compare the
 * rendered FOUC script against this single source of truth.
 */
export const THEME_COLOR_TOKENS: Readonly<{
  light: string;
  dark: string;
}> = parseThemeColorTokens(themeCss);

/**
 * Canonical light-selector literal from `src/styles/theme.css`. The
 * actual rule is the comma-grouped `:root, [data-theme="light"] { … }`;
 * matching both literals individually with `indexOf` is order-
 * sensitive (the FIRST `:root,` hit would win if a future contributor
 * added another `:root,` rule earlier in the file). Anchoring on the
 * full selector pair is unambiguous regardless of CSS reordering.
 *
 * The dark selector `[data-theme="dark"]` is unique on its own (no
 * other rule in the file uses it), so a plain `indexOf` lookup is
 * safe there.
 */
function parseThemeColorTokens(css: string): { light: string; dark: string } {
  const stripped = stripCssComments(css);
  const light = extractBackground(findLightBlock(stripped));
  const dark = extractBackground(
    extractBlockBody(stripped, stripped.indexOf('[data-theme="dark"]')) ?? ""
  );
  if (!light || !dark) {
    throw new Error(
      `[themeColorTokens] failed to extract --background values from theme.css. ` +
        `Light block: ${light ?? "<missing>"}. Dark block: ${dark ?? "<missing>"}.`
    );
  }
  return { light, dark };
}

/**
 * Drop CSS block comments so substring scans for selectors don't trip
 * over prose mentions in `theme.css` (the file mentions
 * `[data-theme="dark"]` in a top-of-file documentation comment).
 * Doesn't handle commented-out `*​/` sequences inside other comments
 * — `theme.css` doesn't have any.
 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Slice a substring of `css` between the selector `startIdx` and the
 * matching closing brace. Brace-matched so nested rules
 * (`:root, [data-theme="light"] { … }` counts as one block) don't
 * bleed into each other.
 */
function extractBlockBody(css: string, startIdx: number | -1): string {
  if (startIdx < 0) return "";
  const openBrace = css.indexOf("{", startIdx);
  if (openBrace < 0) return "";
  let depth = 0;
  for (let i = openBrace; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(openBrace + 1, i);
    }
  }
  return "";
}

/**
 * Convenience: resolve the `--background` value belonging to the
 * first selector match in `css`. Mirrors the production
 * `parseThemeColorTokens` flow (strip comments → find selector →
 * slice brace-matched block → extract `--background`). Exported so
 * tests can pin the contract end-to-end across selectors and short-
 * hex normalisations without re-implementing the brace walker.
 */
export function parseBackgroundFromCss(
  css: string,
  selector: string
): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = stripped.indexOf(selector);
  if (start < 0) return null;
  const block = extractBlockBody(stripped, start);
  if (!block) return null;
  return extractBackground(block);
}

/**
 * Expand a CSS hex literal to its 6-digit form. Accepts:
 *   - `#fff`, `#FFF`           → `#ffffff`
 *   - `#ffff` (4-digit, RGBA)  → `#ffffff` (alpha dropped; the
 *                                 browser-chrome colour is opaque at
 *                                 pre-paint time, alpha cannot be
 *                                 expressed in `<meta name="theme-color">`)
 *   - `#ffffff` (6-digit)      → `#ffffff`
 *   - `#ffffffff` (8-digit)    → `#ffffff` (alpha dropped)
 *
 * Returns `null` when the input is not a hex literal (rgb(), hsl(),
 * `var(--x)`, named colours, etc.). Callers should surface the
 * unsupported-syntax case with a meaningful build-time diagnostic so
 * authors replace it with a literal hex value rather than silently
 * breaking the FOUC script.
 */
function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const hexMatch = /^#([0-9a-fA-F]{3,8})$/.exec(trimmed);
  if (!hexMatch) return null;
  const digits = hexMatch[1]!;
  let six: string;
  if (digits.length === 3) {
    six = digits
      .split("")
      .map(ch => ch + ch)
      .join("");
  } else if (digits.length === 4) {
    // 4-digit form is RGB + alpha; the alpha component is dropped
    // because `<meta name="theme-color">` cannot express transparency.
    six = digits
      .slice(0, 3)
      .split("")
      .map(ch => ch + ch)
      .join("");
  } else if (digits.length === 6) {
    six = digits;
  } else if (digits.length === 8) {
    // 8-digit form is RGBA; alpha is dropped (same constraint as 4-digit).
    six = digits.slice(0, 6);
  } else {
    return null;
  }
  return `#${six.toLowerCase()}`;
}

export function extractBackground(block: string): string | null {
  // `--background: <value>;` where `<value>` is a hex literal.
  // Captures everything (trimmed) between the `:` and the terminating
  // `;` so we can normalise short-hex / 8-digit-hex forms. Anything
  // outside that set (rgb()/hsl()/oklch()/var()) is rejected so the
  // build surfaces the unsupported-syntax case instead of silently
  // shipping an undefined theme color.
  const match = /--background\s*:\s*([^;]+)\s*;/.exec(block);
  if (!match) return null;
  const hex = normalizeHexColor(match[1]!);
  if (hex) return hex;
  // Non-hex value — surface the form so the error message is useful.
  const raw = match[1]!.trim();
  throw new Error(
    `[themeColorTokens] --background value "${raw}" is not a hex literal ` +
      `(3/4/6/8-digit hex supported). Pre-paint <meta name="theme-color"> ` +
      `requires an opaque hex colour; rgb()/hsl()/var() cannot be resolved ` +
      `before CSS variables compute. Set a literal hex value in theme.css, ` +
      `or override THEME_COLOR_TOKENS_LIGHT / THEME_COLOR_TOKENS_DARK in ` +
      `src/utils/themeColorTokens.ts.`
  );
}

/**
 * Build a JS object literal suitable for inline `is:inline` injection:
 *     { light: '#fdfdfd', dark: '#212737' }
 */
export function themeColorScriptObject(): string {
  return `{ light: "${THEME_COLOR_TOKENS.light}", dark: "${THEME_COLOR_TOKENS.dark}" }`;
}
