/**
 * FOUC-prevention script, extracted from the inline pre-paint script
 * block in `src/layouts/Layout.astro` (M30 in issues.md). Lives here
 * so the script body is unit-testable: a typo in the IIFE used to
 * strand the page on the default light theme with no diagnostic — the
 * only test surface was grepping the rendered `dist/` HTML.
 *
 * The contract:
 *   - Reads `window.__themeColors` (injected by `themeColorScriptObject`
 *     earlier in the head) to resolve the active theme-color literal.
 *   - Falls back to the OS `prefers-color-scheme` media query if local
 *     storage is unreachable (private mode, third-party-context block,
 *     cookies disabled) — without this, those environments stalled on
 *     the default light theme AND with the wrong Chrome colour.
 *   - Wraps the body in a single `try/catch` so a `SecurityError` on
 *     `localStorage` (or any other DOM throw) doesn't strand the page.
 *   - Sets `data-theme` on the document root + the `dark` class so
 *     Tailwind's dark variant resolves from the very first paint.
 *   - Fills the empty theme-color meta from `themeColorTokens` so the
 *     browser chrome (Android nav bar, iOS status bar tint) matches
 *     the page background on first paint.
 *   - Exposes `window.__theme = { value: theme }` so `theme.ts` can
 *     skip re-detecting the value after hydration.
 *
 * Output: a single `foucScriptBody()`-pumped string, with no outer
 * script tags. Consumed by Layout.astro via the Astro directive that
 * inline-injects arbitrary HTML; see Layout.astro for the call site.
 *
 * Re-renders / purity
 * -------------------
 * `foucScriptBody` is a pure function of its inputs — no module
 * state, no side effects — so it's safe to call repeatedly during a
 * build. Returns a string that's syntactically identical across
 * calls for the same inputs.
 */
export function foucScriptBody(): string {
  // The body MUST keep these invariants so the existing `themeColorTokens.test.ts`
  // and `audit20260714Regression.test.ts` source-shape assertions
  // continue to hold:
  //  - References `window.__themeColors` (NOT a hardcoded hex literal).
  //  - Resolves the colour from `colors.dark` / `colors.light`.
  //  - Sets `window.__theme.value` for the hydration path.
  return `
(function () {
  try {
    var stored = null;
    try {
      stored = window.localStorage.getItem("theme");
    } catch (_e) {
      // Storage blocked — fall through to OS preference.
    }
    var prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    var theme = stored || (prefersDark ? "dark" : "light");
    var root = document.firstElementChild;
    if (root) {
      root.setAttribute("data-theme", theme);
      root.classList.toggle("dark", theme === "dark");
    }
    var colors = window.__themeColors;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && colors) {
      meta.setAttribute(
        "content",
        theme === "dark" ? colors.dark : colors.light
      );
    }
    window.__theme = { value: theme };
  } catch (_e) {
    // Worst case: a fully broken environment — leave <html>
    // untouched so CSS defaults take over.
  }
})();
`.trim();
}
