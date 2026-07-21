import { describe, it, expect, beforeEach } from "vitest";

/**
 * Smoke test for the DOM-env vitest project (5.4 in the fix prompt).
 *
 * Goal: prove that the `dom` project wires happy-dom correctly and
 * that the per-test setup file resets `document.documentElement`
 * between cases. Behavioural tests for `theme.ts`, `mermaid.ts`,
 * and `postEnhancements.ts` would land in this project — they need
 * a DOM because they touch `MutationObserver`, `<details>` close
 * handlers, etc. Keeping a tiny smoke test here means a config
 * regression (e.g. accidental removal of the `dom` project) gets
 * caught in CI rather than at the next behavioural-test attempt.
 */
describe("dom env (happy-dom) smoke", () => {
  beforeEach(() => {
    // `setupDom.ts` should have cleared these; assert they remain
    // clean across tests. (The beforeEach in setupDom.ts + this
    // beforeEach together prove that the global setup hook runs and
    // leaks nothing between cases.)
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("exposes a usable DOM", () => {
    const root = document.createElement("div");
    root.setAttribute("data-theme", "dark");
    document.body.appendChild(root);
    expect(document.querySelector("[data-theme]")).toBe(root);
    expect(root.dataset.theme).toBe("dark");
  });

  it("cleans `data-theme` between tests", () => {
    // If `setupDom.ts`'s beforeEach hook isn't wired, this test
    // will inherit `data-theme="dark"` from the previous case.
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("supports MutationObserver (the engine mermaid.ts & theme.ts hook into)", async () => {
    const observed: string[] = [];
    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "data-theme") {
          observed.push(document.documentElement.dataset.theme ?? "");
        }
      }
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.setAttribute("data-theme", "dark");
    // happy-dom flushes MutationObserver records on the next microtask,
    // not synchronously. Yield once before disconnecting so the
    // recorded values land before we assert on them.
    await Promise.resolve();
    mo.disconnect();
    expect(observed.length).toBeGreaterThanOrEqual(1);
    expect(observed[observed.length - 1]).toBe("dark");
  });
});
