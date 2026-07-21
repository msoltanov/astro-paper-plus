/**
 * Back-to-top button controller.
 *
 * Extracted from `src/components/post/BackToTopButton.astro`'s inline
 * `<script>` block so it can be imported (and unit-tested) directly
 * without disk-reading + `eval`-ing the .astro source. The Astro
 * component now ships an `is:inline data-astro-rerun` block that just
 * calls `installBackToTop()` on every page-load — mirroring Astro's
 * "rerun the inline script on every page-load" semantics while keeping
 * the implementation testable.
 *
 * Behaviour pinned by `src/__tests__/backToTopButton.dom.test.ts`:
 *   - `window.__bttBound` gates ONLY the scroll-listener attachment
 *     so it attaches exactly once for the lifetime of the page
 *     (across View Transition swaps). The handler body re-queries
 *     the DOM on every tick so it always toggles the live container
 *     — even after a swap replaced the old, detached node.
 *   - `_clickBound` (per-button flag) gates the click listener so the
 *     same DOM node can't accumulate multiple click handlers if the
 *     script re-runs while the button is still in the DOM. After a
 *     View Transition swap, the freshly-rendered button carries no
 *     flag and gets one fresh binding — the previous shape of this
 *     script gated EVERYTHING on `__bttBound` and never re-resolved
 *     the post-swap node, so the new post page's button was
 *     dead-weight DOM (cached container reference, cached click
 *     handler, no scroll updates).
 *   - The click handler honours `prefers-reduced-motion`: instant
 *     jump instead of animated scroll.
 *   - P2-28: the scroll handler is rAF-throttled. The previous code
 *     fired on every scroll event and did two `querySelector`s +
 *     a forced reflow (`scrollHeight - clientHeight`) + four
 *     `classList.toggle`s per event — a noticeable hit on long
 *     pages with continuous scroll input. A single rAF tick per
 *     frame amortises to one update per repaint, regardless of
 *     how many scroll events fire.
 */

export function installBackToTop(): void {
  if (typeof window === "undefined") return;

  // Gate the scroll listener ONLY — the click handler is per-DOM-
  // node and must re-resolve on every call (the BackToTopButton is
  // part of the post detail page and is replaced wholesale on each
  // View Transition navigation, not a persistent header element).
  const win = window as unknown as { __bttBound?: boolean };
  const firstInstall = !win.__bttBound;
  win.__bttBound = true;

  // Re-resolve the current button on every call. The cached
  // reference from the previous page would point at a detached
  // node and the new page's button would not appear or scroll.
  const backToTopBtn = document.querySelector<
    HTMLElement & { _clickBound?: boolean }
  >("[data-button='back-to-top']");

  // Scroll listener: attached exactly once on first install. The
  // body re-queries `#btt-btn-container` per rAF tick so it always
  // targets the live container after a swap. (`backToTopBtn` itself
  // is unused here — only the container matters for visibility.)
  if (firstInstall) {
    let ticking = false;
    document.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        // P3-12: `document.documentElement` is always present in a
        // real document — no guard needed.
        // Re-resolve the container on every tick so the visibility
        // toggle hits the current page's element after a swap.
        const container =
          document.querySelector<HTMLElement>("#btt-btn-container");
        if (!container) return;
        const root = document.documentElement;
        // P3-10: guard against divide-by-zero when the page is
        // shorter than the viewport.
        const scrollTotal = root.scrollHeight - root.clientHeight;
        const scrollTop = root.scrollTop;
        const isVisible = scrollTotal > 0 && scrollTop / scrollTotal > 0.3;
        container.classList.toggle("opacity-100", isVisible);
        container.classList.toggle("translate-y-0", isVisible);
        container.classList.toggle("opacity-0", !isVisible);
        container.classList.toggle("translate-y-14", !isVisible);
        // #34 A11Y — when the button is hidden, take it out of the
        // tab order (`tabindex="-1"`) and hide it from the
        // accessibility tree (`aria-hidden="true"`). The button
        // toggles visibility via opacity/translate, but stays
        // focusable and reachable by keyboard / screen-reader
        // navigation otherwise. Toggling `tabindex` per frame is
        // cheap (single attribute set) and removes the
        // "Tab to an invisible button" footgun.
        const btn = container.querySelector<HTMLButtonElement>(
          "[data-button='back-to-top']"
        );
        if (btn) {
          if (isVisible) {
            btn.removeAttribute("tabindex");
            btn.removeAttribute("aria-hidden");
          } else {
            btn.setAttribute("tabindex", "-1");
            btn.setAttribute("aria-hidden", "true");
          }
        }
      });
    });
  }

  // Click listener: per-DOM-node. The `_clickBound` flag on the OLD
  // detached button survives a swap and is irrelevant (the node is
  // gone); the freshly-rendered button carries no flag, so this
  // block runs and binds a fresh handler. Subsequent calls in the
  // same page lifetime see the flag and no-op, keeping the
  // single-binding-per-node contract.
  if (backToTopBtn && !backToTopBtn._clickBound) {
    backToTopBtn._clickBound = true;
    backToTopBtn.addEventListener("click", () => {
      // Honour `prefers-reduced-motion`: jump instantly instead of
      // animating the scroll. The OS-level media query is checked
      // at click time (not boot time) so a user who flips the
      // setting mid-session gets the correct behaviour on the
      // very next click without a reload.
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      window.scrollTo({
        top: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
  }
}
