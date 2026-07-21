/**
 * Tests for `src/scripts/fouc.ts#foucScriptBody` (M30 in issues.md —
 * extract the FOUC-prevention IIFE out of `Layout.astro` so a typo
 * in the pre-paint path is unit-testable).
 *
 * The body is rendered into `<script is:inline set:html={...} />`,
 * so the assertions are about the SOURCE TEXT of the function — the
 * build-time literal that ships in the head.
 */
import { describe, it, expect } from "vitest";
import { foucScriptBody } from "@/scripts/fouc";

describe("foucScriptBody (M30)", () => {
  it("returns a non-empty string", () => {
    const body = foucScriptBody();
    expect(typeof body).toBe("string");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("starts with an IIFE so the script executes once but doesn't pollute globals", () => {
    // The IIFE wrapper is the load-bearing safety: a SyntaxError in
    // pre-paint would otherwise strand the page on no theme at all.
    expect(foucScriptBody().trimStart().startsWith("(function () {")).toBe(
      true
    );
    expect(foucScriptBody().trimEnd().endsWith("})();")).toBe(true);
  });

  it("wraps the body in a try/catch that survives a localStorage SecurityError", () => {
    // The defensive try/catch is what kept the page from going
    // dark-blank in private browsing on Safari 14+, etc. Pin the
    // shape so a future refactor can't accidentally unwrap it.
    const body = foucScriptBody();
    expect(body).toMatch(/try\s*\{[\s\S]*\}\s*catch\s*\(_e\)\s*\{/);
  });

  it("reads `window.__themeColors` (injected earlier by themeColorScriptObject) instead of hardcoded hex literals", () => {
    const body = foucScriptBody();
    expect(body).toMatch(/window\.__themeColors/);
    // The forbidden shape: hex literals inside the active ternary.
    // Without this, M1's source-of-truth is silently broken.
    expect(body).not.toMatch(/theme\s*===\s*"dark"\s*\?\s*"#\d+/);
    // The matching ternary reaches into the runtime-injected object.
    expect(body).toMatch(/colors\.dark\s*:\s*colors\.light/);
  });

  it("exposes the resolved theme on `window.__theme` for the hydration path in theme.ts", () => {
    expect(foucScriptBody()).toMatch(/window\.__theme\s*=\s*\{\s*value:/);
  });

  it("toggles `data-theme` AND the `dark` class on the document root", () => {
    // Tailwind's `dark:` variant resolves from the `dark` class on
    // the root. Without it, dark-mode users would see a wrong-colour
    // page until theme.ts re-runs after hydration.
    const body = foucScriptBody();
    expect(body).toMatch(/setAttribute\(\s*["']data-theme["']/);
    expect(body).toMatch(/classList\.toggle\(\s*["']dark["']/);
  });

  it("falls back to `prefers-color-scheme: dark` media query when localStorage is unreachable", () => {
    // Source keeps the `matchMedia(...)` call split across multiple
    // lines for readability; the literal media query string embeds
    // its own parens (`(prefers-color-scheme: dark)`). Match the
    // `(prefers-color-scheme: dark)` substring after `matchMedia(`,
    // and let `[\s\S]*?` cross the newline(s).
    expect(foucScriptBody()).toMatch(
      /matchMedia\([\s\S]*?\(prefers-color-scheme:\s*dark\)/
    );
  });

  it("fills the empty theme-color meta from window.__themeColors", () => {
    expect(foucScriptBody()).toMatch(
      /meta\.setAttribute\(\s*["']content["']\s*,\s*theme\s*===\s*"dark"\s*\?\s*colors\.dark\s*:\s*colors\.light/
    );
  });
});
