/**
 * Pin the contract introduced by the M1 fix: the FOUC pre-paint
 * theme-color literals in the rendered FOUC script body must come
 * from `src/styles/theme.css` `--background`, not from hardcoded
 * hex values. A drift between the two sources produces a one-frame
 * flash of the wrong browser-chrome colour after a theme change.
 *
 * M30 (issues.md): the FOUC script body was extracted from
 * `src/layouts/Layout.astro` into `src/scripts/fouc.ts`. The
 * contract is now asserted against `fouc.ts` (the source of truth)
 * rather than against Layout.astro's rendered inline `<script>` —
 * the inline block is now a one-line `<script is:inline
 * set:html={foucScriptBody()} />`.
 *
 * Strategy: read the CSS file directly and extract the light/dark
 * `--background` values, then assert that `fouc.ts`'s `foucScriptBody`
 * references them via `window.__themeColors` (injected earlier by
 * `themeColorScriptObject()`) rather than hardcoding them inline.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";
import {
  THEME_COLOR_TOKENS,
  themeColorScriptObject,
  parseBackgroundFromCss,
} from "@/utils/themeColorTokens";

const here = dirname(urlToPath(import.meta.url));
const root = (rel: string) => resolve(here, "..", "..", rel);

const themeCssPath = root("src/styles/theme.css");
const layoutPath = root("src/layouts/Layout.astro");
const tokensPath = root("src/utils/themeColorTokens.ts");

const read = (p: string) => readFileSync(p, "utf8");

describe("M1 — theme-color tokens", () => {
  it("source CSS has the expected light + dark --background values", () => {
    expect(existsSync(themeCssPath)).toBe(true);
    const css = read(themeCssPath);
    expect(parseBackgroundFromCss(css, ":root,")).toBe("#fdfdfd");
    expect(parseBackgroundFromCss(css, '[data-theme="dark"]')).toBe("#212737");
  });

  it("themeColorTokens module exists and combines Vite ?raw with an fs fallback", () => {
    expect(existsSync(tokensPath)).toBe(true);
    const src = read(tokensPath);
    expect(src).toMatch(/export\s+const\s+THEME_COLOR_TOKENS\s*:/);
    expect(src).toMatch(/--background/);
    // Primary read is Vite's `?raw` (inlines CSS into the Astro
    // bundle, avoiding fs reads from `dist/.prerender/` at build
    // time). A `node:fs` fallback handles the vitest case where
    // `?raw` on `.css` returns empty.
    expect(src).toMatch(/styles\/theme\.css\?raw/);
    expect(src).toMatch(/fileURLToPath/);
    expect(src).toMatch(/styles\/theme\.css/);
  });

  it("Layout injects `window.__themeColors` via `themeColorScriptObject` before the FOUC script", () => {
    const layout = read(layoutPath);
    // The injection script: `window.__themeColors = ${themeColorScriptObject()};`
    // is built from `themeColorScriptObject()` at render time, so the
    // source contains the `${themeColorScriptObject()}` interpolation
    // rather than literal hex values.
    expect(layout).toMatch(
      /window\.__themeColors\s*=\s*\$\{themeColorScriptObject\(\)\}/
    );
    // Injection happens in the head, before the inline FOUC
    // `<script is:inline set:html={foucScriptBody()} />` consumer.
    const injectionIdx = layout.indexOf("window.__themeColors =");
    const foucIdx = layout.indexOf("set:html={foucScriptBody()}");
    expect(injectionIdx).toBeGreaterThan(-1);
    expect(foucIdx).toBeGreaterThan(-1);
    expect(injectionIdx).toBeLessThan(foucIdx);
  });

  it("FOUC script body reads `window.__themeColors.{light,dark}` (no hardcoded hex)", () => {
    // M30: the body is now sourced from `src/scripts/fouc.ts`. Test it
    // directly so the contract pin doesn't depend on a specific
    // string shape inside Layout.astro.
    const foucPath = root("src/scripts/fouc.ts");
    expect(existsSync(foucPath)).toBe(true);
    const body = read(foucPath);
    // The forbidden shape: hex literals hardcoded inside the ternary
    // that fills `<meta name="theme-color">`.
    expect(body).not.toMatch(/theme\s*===\s*"dark"\s*\?\s*"#\d+/);
    // The matching ternary must reach into the runtime token object.
    expect(body).toMatch(/colors\.dark\s*:\s*colors\.light/);
    // Reads from the runtime-injected object rather than carrying
    // its own {light, dark} literal.
    expect(body).toMatch(/window\.__themeColors/);
  });

  it("THEME_COLOR_TOKENS parses the light + dark --background values from theme.css", () => {
    // The point of the M1 fix is to give the FOUC script values that
    // can never drift from the CSS source. Executing the module is
    // what proves it — source-only assertions are easy to bypass with
    // a refactor. The fs read resolves via import.meta.url under both
    // vitest and the Astro SSR build, so this exercises the parser
    // end-to-end.
    expect(THEME_COLOR_TOKENS.light).toBe("#fdfdfd");
    expect(THEME_COLOR_TOKENS.dark).toBe("#212737");
  });

  it("themeColorScriptObject emits an inline-injectable JS object literal", () => {
    // The output is concatenated into `window.__themeColors = ${...};`
    // at render time, so it has to be syntactically valid JS with
    // double-quoted strings (the inline `<script>` runs in HTML
    // parsing — single quotes survive, but we standardised on doubles
    // to match the rest of the file's prose).
    expect(themeColorScriptObject()).toBe(
      '{ light: "#fdfdfd", dark: "#212737" }'
    );
  });

  it("FOUC script body has no `||` hex fallback (would re-introduce M1 drift)", () => {
    // Belt-and-braces for the M1 follow-up: the FOUC script must
    // NOT carry its own `{ light: "#…", dark: "#…" }` fallback. A
    // drift between that literal and theme.css would re-introduce
    // the exact bug M1 was supposed to eliminate.
    const foucPath = root("src/scripts/fouc.ts");
    const body = read(foucPath);
    expect(body).not.toMatch(
      /window\.__themeColors\s*\|\|\s*\{\s*light:\s*"#[\da-fA-F]{6}"/
    );
  });

  // H — the previous regex required EXACTLY 6 hex digits, so any
  // theme change using `#fff` / `#fff8` / `#ffffff80` would break the
  // FOUC script at parse time. The fix normalises 3/4/6/8-digit hex
  // values to a 6-digit, opaque-equivalent form so authors can ship
  // short-hex without thinking about FOUC implications.
  it("H: themeColorTokens normalises 3-digit short-hex values (#fff → #ffffff)", () => {
    const css = `
      :root, [data-theme="light"] { --background: #fff; }
      [data-theme="dark"] { --background: #abc; }
    `;
    expect(parseBackgroundFromCss(css, ":root,")).toBe("#ffffff");
    expect(parseBackgroundFromCss(css, '[data-theme="dark"]')).toBe("#aabbcc");
  });

  it("H: themeColorTokens drops the alpha component of 4-digit and 8-digit hex", () => {
    const css = `
      :root, [data-theme="light"] { --background: #ffff; }
      [data-theme="dark"] { --background: #abcdef80; }
    `;
    expect(parseBackgroundFromCss(css, ":root,")).toBe("#ffffff");
    expect(parseBackgroundFromCss(css, '[data-theme="dark"]')).toBe("#abcdef");
  });

  it("H: themeColorTokens throws a clear error on rgb()/hsl()/var() values", () => {
    const css = `
      :root, [data-theme="light"] { --background: rgb(255, 255, 255); }
    `;
    expect(() => parseBackgroundFromCss(css, ":root,")).toThrow(
      /not a hex literal/
    );
    expect(() => parseBackgroundFromCss(css, ":root,")).toThrow(/rgb\(\)/);
  });
});
