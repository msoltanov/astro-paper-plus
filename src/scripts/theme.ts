import { safeLocal } from "@/utils/safeStorage";

const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";

/**
 * Theme controller for the site. Runs once on first load and re-runs
 * after every Astro View Transition swap.
 *
 * Lifecycle
 * ---------
 * - Reads the value set by the inline FOUC-prevention script in
 *   `src/layouts/Layout.astro` (window.__theme.value) and falls back to
 *   `localStorage` / `prefers-color-scheme` for first-page visits before
 *   the inline script could run.
 * - On boot, mirrors the theme onto:
 *     - `<html data-theme="…">` and `<html class="dark">` (Tailwind dark mode)
 *     - `<meta name="theme-color">` (Android browser chrome colour)
 *     - `#theme-btn`'s `aria-pressed` (state for assistive tech — we do
 *       **not** overwrite `aria-label` because Header.astro already sets
 *       it to the i18n toggle string and overwriting would silence the
 *       label in favour of "light"/"dark", which is what an earlier
 *       long-line regression did).
 * - On button click, flips the theme and re-runs the persist/mirror.
 * - On OS-level colour-scheme change, follows the user's machine
 *   unless they have an explicit preference in localStorage.
 * - On `astro:before-swap`, carries the theme-color value across the
 *   View Transition so Android's navigation bar doesn't flash.
 */

function getPreferredTheme(): string {
  const stored = safeLocal.get(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

// Reuse the value already set by the inline FOUC-prevention script if
// available. The inline script (`src/layouts/Layout.astro`, fired synchronously
// in `<head>` before any module scripts) writes `window.__theme.value` before
// this module evaluates, so under normal operation the module load already
// sees the correct value.
//
// T3-6 race window: if the inline script is blocked by CSP or the page render
// is delayed past the module-load tick (extremely slow first paint, deferred
// module pipeline), `window.__theme` is still undefined when this line
// evaluates. We then call `getPreferredTheme()`, which queries
// `prefers-color-scheme` AT MODULE LOAD — not at the first `setup()` call.
// A user who switches their OS from light to dark between this read and the
// next `astro:after-swap` will see the stale OS value for one frame.
//
// This is the documented corner case the inline FOUC script is intended to
// prevent; in practice the inline script always wins. The defensive
// `getPreferredTheme()` fallback only runs when the inline script was
// genuinely unable to set `__theme` (CSP-blocked inline scripts, disabled
// JS extension, etc.) — see issues.md T3-6 for the audit trail.
let themeValue: string = window.__theme?.value ?? getPreferredTheme();

function persist(): void {
  safeLocal.set(THEME_KEY, themeValue);
  // Invalidate the cache BEFORE reflect() so the upcoming
  // readBodyBackground() call re-reads the body's computed
  // background-colour. The body colour changes as soon as
  // <html data-theme="…"> is set (CSS custom properties re-resolve),
  // so reflect() needs a fresh read — a cache populated during the
  // previous setup() would return the *old* theme's colour and
  // <meta name="theme-color"> would stay on the previous Android
  // browser-chrome colour until the next swap. See issues.md M6.
  cachedBodyBackground = undefined;
  reflect();
}

/**
 * Compute the resolved CSS colour for `<meta name="theme-color">` from the
 * body's actual `background-color`. Returns null when the body has no
 * computed background (e.g. before paint) so the caller can skip the write.
 *
 * Cached on first successful read so a single `reflect()` pass doesn't
 * pay for `getComputedStyle` more than once. The cache is invalidated:
 *   - by `persist()` BEFORE it calls `reflect()` (theme flip / OS
 *     scheme change) so the new theme's body colour is read; see M6,
 *   - by the `astro:after-swap` re-bind so the cached colour from the
 *     previous page doesn't bleed into the new one.
 */
let cachedBodyBackground: string | null | undefined;
function readBodyBackground(): string | null {
  if (cachedBodyBackground !== undefined) return cachedBodyBackground;
  const bg = window.getComputedStyle(document.body).backgroundColor;
  // `getComputedStyle` returns `"rgba(0, 0, 0, 0)"` when nothing is set —
  // guard against emitting a useless transparent value, and cache `null`
  // so the second call doesn't repeat the failing lookup.
  cachedBodyBackground = bg && bg !== "rgba(0, 0, 0, 0)" ? bg : null;
  return cachedBodyBackground;
}

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-theme", themeValue);
  root?.classList.toggle("dark", themeValue === DARK);

  // Fill `<meta name="theme-color">` with the computed background
  // colour so Android's browser chrome matches the page background.
  // Falls back to skipping the write when getComputedStyle returns
  // the default transparent (typical before first paint).
  const bg = readBodyBackground();
  if (bg) {
    document
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", bg);
  }

  // `aria-pressed` mirrors the toggle state for assistive tech. We
  // intentionally do NOT touch `aria-label` — Header.astro sets it to
  // the localized toggle string (`Toggle theme` / `Сменить темы` / etc.)
  // and overwriting it on every flip would announce the bare word
  // `light`/`dark`, defeating the translation.
  document
    .querySelector("#theme-btn")
    ?.setAttribute("aria-pressed", String(themeValue === DARK));
}

function setup(): void {
  reflect();
  const themeBtn = document.querySelector<HTMLButtonElement>("#theme-btn");
  if (!themeBtn) return;
  // Guard against re-attaching the listener on every swap — the button
  // survives View Transitions (persistent header), so one bind suffices.
  if (themeBtn.dataset.themeBound) return;
  themeBtn.dataset.themeBound = "1";
  themeBtn.addEventListener("click", () => {
    themeValue = themeValue === LIGHT ? DARK : LIGHT;
    persist();
  });
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", () => {
  // Invalidate the cached background colour — the swapped-in page may
  // pick up a different `--background` value (custom theme, per-page
  // override, etc.) and the stale cache would write the wrong colour
  // into `<meta name="theme-color">` until the next click.
  cachedBodyBackground = undefined;
  // M23: re-read the FOUC script's `window.__theme.value` so a
  // previous-page staleness (e.g. an in-flight script wrote a wrong
  // value before localStorage was available, and we cached it once
  // at module load) doesn't survive a swap. Falls back to the
  // module-level `themeValue` if `__theme` is missing — defensive
  // because the inline FOUC script always sets it pre-paint.
  const next = window.__theme?.value;
  if (next === LIGHT || next === DARK) {
    themeValue = next;
  }
  setup();
});

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  // P3-1: the inline cast is unavoidable today — `BeforeEvent` is
  // declared in `node_modules/astro/dist/transitions/events.d.ts`
  // but Astro's TS public surface doesn't re-export it under any
  // imported path that `astro check` resolves cleanly. The cast
  // shape mirrors the runtime type:
  //   class BeforeEvent extends Event { newDocument: Document; }
  // and the `"newDocument" in event` guard keeps the cast safe even
  // if the event type ever drifts.
  if (color && "newDocument" in event) {
    (event as Event & { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// Sync with OS-level dark/light preference changes.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches }) => {
    // Only follow the OS preference when the user has not explicitly
    // picked a theme via the toggle (localStorage has no entry).
    if (safeLocal.get(THEME_KEY)) return;
    themeValue = matches ? DARK : LIGHT;
    persist();
  });
