/**
 * Behavioural DOM test for the BackToTop script's idempotence contract.
 *
 * The script lives in `src/scripts/backToTopButton.ts` and is bound
 * from `src/components/post/BackToTopButton.astro`'s hoisted
 * `<script>`. The contract the module must keep:
 *
 *   - `window.__bttBound` gates ONLY the scroll-listener attachment
 *     so it attaches exactly once for the lifetime of the page
 *     (across View Transition swaps). The handler body re-queries
 *     the DOM on every rAF tick so it always toggles the live
 *     container — even after a swap replaced the old, detached one.
 *   - The click listener is bound per-DOM-node via the `_clickBound`
 *     flag. After a swap, the freshly-rendered button has no flag
 *     and gets one fresh binding; subsequent calls in the same page
 *     lifetime see the flag and no-op (single-binding-per-node).
 *   - The click handler honours `prefers-reduced-motion` — instant
 *     jump vs animated scroll.
 *   - P2-28: the scroll handler is rAF-throttled. Tests that
 *     previously relied on the click handler being attached
 *     INSIDE the scroll listener now must read the bound handler
 *     post-install directly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installBackToTop } from "@/scripts/backToTopButton";

function installButton() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.id = "btt-btn-container";
  container.className = "opacity-0 translate-y-14";
  const btn = document.createElement("button");
  btn.setAttribute("data-button", "back-to-top");
  btn.textContent = "↑";
  container.appendChild(btn);
  document.body.appendChild(container);
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: 500,
  });
  return btn;
}

function setScrollTop(value: number) {
  Object.defineProperty(document.documentElement, "scrollTop", {
    configurable: true,
    get() {
      return value;
    },
  });
}

/** Flush pending rAF callbacks so the rAF-throttled scroll handler
 * (P2-28) actually runs against the latest `scrollTop` value. */
async function flushRaf() {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

describe("BackToTop (behavioural, dom env)", () => {
  beforeEach(() => {
    (window as unknown as { __bttBound?: boolean }).__bttBound = false;
  });

  it("attaches a single scroll listener across multiple reruns (no leak)", () => {
    installButton();
    const addSpy = vi.spyOn(document, "addEventListener");
    installBackToTop();
    installBackToTop();
    installBackToTop();

    const scrollCalls = addSpy.mock.calls.filter(
      ([event]) => event === "scroll"
    );
    expect(scrollCalls).toHaveLength(1);
    addSpy.mockRestore();
  });

  it("attaches the click listener exactly once across reruns", () => {
    // P2-28: the click handler is bound once during install; the
    // per-button `_clickBound` flag is still the idempotence guard
    // for the case where install is called twice with the same
    // button in the DOM.
    const btn = installButton();
    const addSpy = vi.spyOn(btn, "addEventListener");

    installBackToTop();
    installBackToTop();

    const clickCalls = addSpy.mock.calls.filter(([event]) => event === "click");
    expect(clickCalls).toHaveLength(1);
    addSpy.mockRestore();
  });

  it("shows the button when scrollTop / (scrollHeight - clientHeight) > 0.3", async () => {
    installButton();
    const container = document.getElementById(
      "btt-btn-container"
    ) as HTMLElement;
    expect(container.classList.contains("opacity-0")).toBe(true);
    expect(container.classList.contains("translate-y-14")).toBe(true);

    installBackToTop();

    // Simulate scrolling to 50% — visibility threshold is 0.3.
    setScrollTop(250);
    document.dispatchEvent(new Event("scroll"));
    // P2-28: the scroll handler is rAF-throttled, so the visibility
    // update only fires after the next animation frame.
    await flushRaf();

    expect(container.classList.contains("opacity-100")).toBe(true);
    expect(container.classList.contains("translate-y-0")).toBe(true);
    expect(container.classList.contains("opacity-0")).toBe(false);
    expect(container.classList.contains("translate-y-14")).toBe(false);
  });

  it("hides the button when scrollTop is below the threshold", async () => {
    installButton();
    installBackToTop();

    setScrollTop(50);
    document.dispatchEvent(new Event("scroll"));
    await flushRaf();

    const container = document.getElementById(
      "btt-btn-container"
    ) as HTMLElement;
    expect(container.classList.contains("opacity-0")).toBe(true);
    expect(container.classList.contains("translate-y-14")).toBe(true);
  });

  it("keeps the button hidden when scrollHeight === clientHeight (no divide-by-zero)", async () => {
    // P3-10: a page shorter than the viewport produced `scrollTotal = 0`
    // and the old `scrollTop / scrollTotal > 0.3` comparison was
    // `0 / 0 = NaN > 0.3 = false` — the button stayed hidden, but for
    // the wrong reason. With `scrollTotal > 0 &&` the new code is
    // explicit about the divide-by-zero guard.
    installButton();
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      value: 0,
    });
    installBackToTop();
    document.dispatchEvent(new Event("scroll"));
    await flushRaf();

    const container = document.getElementById(
      "btt-btn-container"
    ) as HTMLElement;
    expect(container.classList.contains("opacity-0")).toBe(true);
    expect(container.classList.contains("translate-y-14")).toBe(true);
  });

  it("is a no-op when the button container isn't present yet", () => {
    document.body.innerHTML = "";
    expect(() => installBackToTop()).not.toThrow();
  });

  it("scrolls instantly (no smooth animation) when prefers-reduced-motion is set", () => {
    installButton();
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;

    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    installBackToTop();
    const btn = document.querySelector(
      "[data-button='back-to-top']"
    ) as HTMLButtonElement;
    btn.click();

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: "auto",
    });
  });

  it("scrolls smoothly when prefers-reduced-motion is NOT set", () => {
    installButton();
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;

    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});

    installBackToTop();
    const btn = document.querySelector(
      "[data-button='back-to-top']"
    ) as HTMLButtonElement;
    btn.click();

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });

  it("rebinds the click listener on a freshly-rendered button after a View Transition swap", () => {
    // Regression: previous shape gated EVERYTHING on `__bttBound`
    // and early-returned, so the second `installBackToTop()` call
    // (the one fired by `astro:after-swap`) never re-resolved the
    // button. The post-swap DOM carried a fresh button with no
    // `_clickBound` flag, but the script never got the chance to
    // bind a click handler. Clicking the new button did nothing.
    type BttBtn = HTMLButtonElement & { _clickBound?: boolean };
    const oldBtn = installButton() as BttBtn;
    installBackToTop();
    expect(oldBtn._clickBound).toBe(true);

    // Simulate Astro's View Transition: the previous page's DOM is
    // wiped and the next page's DOM is mounted in its place.
    document.body.innerHTML = "";
    const newBtn = installButton() as BttBtn;

    // astro:after-swap → installBackToTop() runs again.
    installBackToTop();

    // Fresh DOM node → fresh flag → fresh click binding.
    expect(newBtn._clickBound).toBe(true);

    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    newBtn.click();
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: expect.stringMatching(/auto|smooth/),
    });
  });

  it("still attaches only one scroll listener across a swap (no listener leak)", () => {
    // First install wires the scroll listener.
    installButton();
    const addSpy = vi.spyOn(document, "addEventListener");
    installBackToTop();
    const baselineScroll = addSpy.mock.calls.filter(
      ([event]) => event === "scroll"
    ).length;
    expect(baselineScroll).toBe(1);

    // View Transition: button replaced.
    document.body.innerHTML = "";
    installButton();

    // astro:after-swap → installBackToTop() runs. Should NOT add a
    // second scroll listener; the previous gate on `__bttBound`
    // only did this by accident (it short-circuited the whole
    // function), the new shape keeps the gate on the scroll-
    // listener attachment specifically.
    installBackToTop();
    const afterSwapScroll = addSpy.mock.calls.filter(
      ([event]) => event === "scroll"
    ).length;
    expect(afterSwapScroll).toBe(1);

    addSpy.mockRestore();
  });

  it("the scroll handler toggles the post-swap container, not the detached pre-swap one", async () => {
    // First install with the initial button.
    installButton();
    installBackToTop();

    // Swap: old container detached, fresh container mounted.
    document.body.innerHTML = "";
    const freshContainer = document.createElement("div");
    freshContainer.id = "btt-btn-container";
    freshContainer.className = "opacity-0 translate-y-14";
    const freshBtn = document.createElement("button");
    freshBtn.setAttribute("data-button", "back-to-top");
    freshBtn.textContent = "↑";
    freshContainer.appendChild(freshBtn);
    document.body.appendChild(freshContainer);

    // astro:after-swap → installBackToTop() runs.
    installBackToTop();

    // The scroll handler's rAF callback re-queries the DOM, so the
    // fresh container is what gets the visibility classes — not the
    // detached one from the previous page.
    setScrollTop(250);
    document.dispatchEvent(new Event("scroll"));

    await flushRaf();

    expect(freshContainer.classList.contains("opacity-100")).toBe(true);
    expect(freshContainer.classList.contains("translate-y-0")).toBe(true);
    expect(freshContainer.classList.contains("opacity-0")).toBe(false);
    expect(freshContainer.classList.contains("translate-y-14")).toBe(false);
  });

  it("#34: removes the button from the tab order when hidden (scroll below 30%)", async () => {
    // #34 A11Y — when the back-to-top button is invisible (scrollTop
    // below the 0.3 threshold), the button must carry `tabindex="-1"`
    // and `aria-hidden="true"` so keyboard users can't Tab into an
    // invisible button and screen readers don't announce it.
    const btn = installButton();
    installBackToTop();

    // Hidden state — button has no `tabindex` or `aria-hidden` set
    // before the scroll handler fires.
    setScrollTop(50);
    document.dispatchEvent(new Event("scroll"));
    await flushRaf();

    expect(btn.getAttribute("tabindex")).toBe("-1");
    expect(btn.getAttribute("aria-hidden")).toBe("true");
  });

  it("#34: restores the tab order when the button becomes visible (scroll above 30%)", async () => {
    // Inverse of the previous case: scrolling back above the
    // threshold clears `tabindex` and `aria-hidden` so the button
    // is reachable again.
    const btn = installButton();
    installBackToTop();

    // Hide first.
    setScrollTop(50);
    document.dispatchEvent(new Event("scroll"));
    await flushRaf();
    expect(btn.getAttribute("tabindex")).toBe("-1");

    // Now show.
    setScrollTop(250);
    document.dispatchEvent(new Event("scroll"));
    await flushRaf();

    expect(btn.hasAttribute("tabindex")).toBe(false);
    expect(btn.hasAttribute("aria-hidden")).toBe(false);
  });
});
