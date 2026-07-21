/**
 * Behavioural test for `src/scripts/theme.ts`.
 *
 * Pins the parts of the theme controller that would silently regress
 * if someone refactored the lifecycle:
 *
 *   1. The inline FOUC script's `window.__theme` value wins on first
 *      load when it's already set (no FOUC, no re-detection).
 *   2. A persisted localStorage value wins over the OS preference.
 *   3. Clicking `#theme-btn` flips `data-theme`, persists to
 *      localStorage, and toggles `aria-pressed`.
 *   4. The script registers its matchMedia `change` listener so an
 *      OS-level scheme change does NOT override an explicit user
 *      choice (the `safeLocal.get(THEME_KEY)` guard).
 *   5. The `astro:before-swap` handler copies the active
 *      `<meta name="theme-color">` value onto the incoming document.
 *
 * Test isolation: theme.ts registers `astro:after-swap` and
 * `astro:before-swap` listeners at module top-level. happy-dom's
 * document is shared between tests; the closure-bound listeners from
 * a previous case would re-fire if we dispatched an `astro:after-swap`
 * event after a fresh import. We avoid that by:
 *
 *   - Putting the `#theme-btn` in the DOM BEFORE the import so the
 *     module's top-level `setup()` binds the click listener
 *     immediately (no `astro:after-swap` dispatch needed in the
 *     click tests).
 *   - Disabling happy-dom's stale-listener accumulation by stubbing
 *     `document.addEventListener` to track + drop astro:* listeners
 *     between cases.
 *
 * ═══ INVARIANT THIS TEST RELIES ON ═══
 *
 * `theme.ts` binds its `astro:after-swap` listener and the
 * `#theme-btn` click listener at MODULE TOP LEVEL (i.e. as a
 * side-effect of `import`). The click tests above therefore put the
 * `#theme-btn` element into the DOM BEFORE the dynamic
 * `await import("@/scripts/theme")` — that way `setup()` finds it on
 * the first module-evaluation pass and binds the listener
 * synchronously. If a future refactor moves the click-listener bind
 * into an exported `setup()` that the consumer must call explicitly
 * (instead of running at import time), every click test below would
 * silently no-op: the import would succeed, the listeners would
 * never bind, and `expect(btn.getAttribute("aria-pressed")).toBe(…)`
 * would still pass against the stale "false" value. The matching
 * source-contract tests in `src/__tests__/theme.test.ts` cover the
 * static shape (no `aria-label` overwrite, `aria-pressed` mirror,
 * theme-color write) but cannot detect "listener never fires"; that's
 * what THIS file pins.
 *
 * If you refactor `theme.ts` to bind lazily, change the click tests
 * in this file to call the new entry point (e.g. `await
 * importFresh(); setupTheme?.()`) instead of relying on import-time
 * binding — otherwise the behavioural guarantees here will rot in
 * place while the test suite still passes.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const cssVarStub = (() => ({
  getPropertyValue: () => "",
  backgroundColor: "",
})) as unknown as typeof window.getComputedStyle;
const originalGetComputedStyle = window.getComputedStyle;
const originalAddEventListener = document.addEventListener.bind(document);
const originalRemoveEventListener = document.removeEventListener.bind(document);

// Track astro:* listeners so a previous case's closure-bound
// handler doesn't fire during the current case's events. Stored on
// `window` so the afterEach hook in each case can wipe them.
type AstroListenerEntry = {
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};
type WindowWithAstro = typeof window & {
  __astroListeners: AstroListenerEntry[];
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
  document.body.innerHTML = "";
  window.localStorage.clear();
  delete window.__theme;
  window.matchMedia = vi.fn().mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  );
  window.getComputedStyle = cssVarStub;

  const tracked: AstroListenerEntry[] = [];
  (window as WindowWithAstro).__astroListeners = tracked;
  document.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (type.startsWith("astro:")) {
      tracked.push({ type, listener, options });
    }
    return originalAddEventListener.call(document, type, listener, options);
  } as typeof document.addEventListener;
  document.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    if (type.startsWith("astro:")) {
      for (let i = tracked.length - 1; i >= 0; i--) {
        const entry = tracked[i];
        if (entry && entry.type === type && entry.listener === listener) {
          tracked.splice(i, 1);
        }
      }
    }
    return originalRemoveEventListener.call(document, type, listener, options);
  } as typeof document.removeEventListener;
});
afterEach(() => {
  window.getComputedStyle = originalGetComputedStyle;
  document.addEventListener = originalAddEventListener;
  document.removeEventListener = originalRemoveEventListener;
});

const importFresh = async () => {
  vi.resetModules();
  return await import("@/scripts/theme");
};

describe("theme (behavioural, dom env)", () => {
  it("uses window.__theme.value from the inline FOUC script when present", async () => {
    window.__theme = { value: "dark" };
    await importFresh();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("falls back to localStorage when __theme is unset", async () => {
    window.localStorage.setItem("theme", "dark");
    await importFresh();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("falls back to OS prefers-color-scheme when nothing else is set", async () => {
    window.matchMedia = vi.fn().mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    );
    await importFresh();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("flips theme on #theme-btn click and persists to localStorage", async () => {
    // Put the button in the DOM BEFORE importing — the module's
    // top-level `setup()` then binds the click listener immediately,
    // so we don't need to dispatch `astro:after-swap` (which would
    // re-fire stale listeners from previous cases).
    document.body.innerHTML = `<button id="theme-btn" aria-label="Toggle"></button>`;
    await importFresh();

    const btn = document.querySelector<HTMLButtonElement>("#theme-btn")!;
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    btn.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    btn.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("binds the click listener once (3 clicks → 3 toggles)", async () => {
    document.body.innerHTML = `<button id="theme-btn" aria-label="Toggle"></button>`;
    await importFresh();
    const btn = document.querySelector<HTMLButtonElement>("#theme-btn")!;

    btn.click();
    btn.click();
    btn.click();

    // 3 clicks each toggle → final state is "dark" (started "light").
    // If the listener were bound twice, this would still be "light"
    // (even number of toggles).
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("does NOT override explicit choice when OS scheme changes", async () => {
    const addEventListenerSpy = vi.fn();
    let osListener: ((e: { matches: boolean }) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: (
            evt: string,
            cb: (e: { matches: boolean }) => void
          ) => {
            addEventListenerSpy(evt, cb);
            if (evt === "change") osListener = cb;
          },
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    );

    window.localStorage.setItem("theme", "dark");
    await importFresh();

    expect(document.documentElement.dataset.theme).toBe("dark");

    expect(osListener).not.toBeNull();
    osListener!({ matches: false });
    expect(document.documentElement.dataset.theme).toBe("dark");

    osListener!({ matches: true });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("carries theme-color across astro:before-swap", async () => {
    await importFresh();

    document.body.innerHTML = `<meta name="theme-color" content="#abcdef" />`;
    const newDoc = document.implementation.createHTMLDocument("");
    const newMeta = document.createElement("meta");
    newMeta.setAttribute("name", "theme-color");
    newMeta.setAttribute("content", "");
    newDoc.head.appendChild(newMeta);
    const evt = new Event("astro:before-swap") as Event & {
      newDocument: Document;
    };
    Object.defineProperty(evt, "newDocument", { value: newDoc });

    document.dispatchEvent(evt);

    expect(newMeta.getAttribute("content")).toBe("#abcdef");
  });

  it("re-reads body background after a theme flip (M6 cache-invalidation order)", async () => {
    // The body's computed background-colour changes as soon as
    // <html data-theme="…"> is set, because the body's `background-color`
    // is driven by a CSS custom property that resolves per-theme. The
    // initial `setup()` populates the readBodyBackground cache with the
    // *first* theme's colour. A subsequent theme flip must invalidate
    // the cache BEFORE reflect() reads it, otherwise the meta tag
    // stays on the previous theme's colour and Android's browser chrome
    // follows the old theme until the next swap.
    //
    // We drive the mock to return a different background-colour on
    // each call (simulating the CSS re-resolution that happens when
    // data-theme flips). The first read returns light, the second
    // returns dark.
    let calls = 0;
    const bgValues = ["#fdfdfd", "#212737"];
    window.getComputedStyle = vi.fn().mockImplementation(
      () =>
        ({
          getPropertyValue: () => "",
          backgroundColor: bgValues[calls++] ?? "rgba(0, 0, 0, 0)",
        }) as unknown as CSSStyleDeclaration
    ) as unknown as typeof window.getComputedStyle;

    document.body.innerHTML = `<button id="theme-btn" aria-label="Toggle"></button><meta name="theme-color" content="" />`;
    await importFresh();

    // Initial setup wrote the light colour.
    expect(
      document
        .querySelector("meta[name='theme-color']")
        ?.getAttribute("content")
    ).toBe("#fdfdfd");

    const btn = document.querySelector<HTMLButtonElement>("#theme-btn")!;
    btn.click();

    // After the flip, the meta must hold the DARK colour. If the cache
    // was invalidated AFTER reflect() (the M6 regression), this
    // assertion fails — the meta would still be "#fdfdfd".
    expect(
      document
        .querySelector("meta[name='theme-color']")
        ?.getAttribute("content")
    ).toBe("#212737");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
