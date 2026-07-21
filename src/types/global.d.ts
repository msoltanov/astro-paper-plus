/**
 * Global type augmentations for the `window` object.
 *
 * The theme + LocaleSwitcher scripts use a few `window.__*` properties to
 * bridge between the inline FOUC-prevention script in `Layout.astro` and
 * the bundled module scripts that run later. Declaring them here (rather
 * than `as any` / `as unknown as` at each call site) keeps the contract
 * explicit and discoverable.
 *
 * Adding a new bridge? Add the property here too.
 */
export {};

declare global {
  interface Window {
    /**
     * Set by the FOUC-prevention script in `Layout.astro` (synchronous,
     * pre-paint). Read by `theme.ts` so it can skip the `matchMedia`
     * re-detection on first import.
     */
    __theme?: { value: string };
    /**
     * P1-2: injected by the FOUC-prevention inline script in
     * `Layout.astro` as `{ light: "#…", dark: "#…" }` (the resolved
     * `--background` token for each theme). Read by the bundled
     * `theme.ts` / Pagefind wiring so the body's first-paint colour
     * matches the picked theme. Declared here so the cross-script
     * contract is type-checked rather than implicit `any`.
     */
    __themeColors?: { light: string; dark: string };
    /**
     * Idempotence guard for the LocaleSwitcher's document-level
     * `click`/`keydown` listeners. Set once after first attach, read on
     * subsequent View Transition swaps.
     */
    __localeSwitcherBound?: boolean;
    /**
     * Idempotence guard for the BackToTopButton scroll listener.
     */
    __bttBound?: boolean;
    /**
     * Idempotence guard for the ResponsiveTable before-swap cleanup.
     */
    __tableScrollBound?: boolean;
    /**
     * Mobile menu focus memory: stored across `astro:after-swap` so
     * the menu can restore focus to whichever element opened it
     * (see `src/components/Header.astro`).
     */
    __menuOpener?: HTMLElement | null;
  }
}
