/**
 * `setupDom.ts` — vitest setup that runs before every DOM-env test.
 *
 * Most of the heavy lifting lives in `happy-dom` itself (it installs
 * `window`, `document`, `MutationObserver`, `matchMedia`, etc.).
 * This file is the place to drop module-level stubs for client
 * scripts that don't resolve under vitest's mock layer (e.g. when a
 * client script imports `@/scripts/postEnhancements` that imports
 * `@/utils/postSlug` which transitively imports a config that
 * references `astro:content`).
 *
 * Currently a stub — the behavioural theme toggle test (5.4 in the
 * fix prompt) would land here. Until then it only clears any
 * leaked state between runs so `document.documentElement` doesn't
 * carry attributes across tests.
 */
import { beforeEach } from "vitest";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});
