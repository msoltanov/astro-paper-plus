/**
 * Behavioural test for `src/scripts/mermaid.ts`.
 *
 * Mermaid's runtime is heavy (ships its own layout engine) so we don't
 * import the real `mermaid` package here. Instead we mock the default
 * export of `"mermaid"` to expose the two methods the script touches:
 *
 *   - `mermaid.initialize(options)`
 *   - `mermaid.render(id, source)` → { svg }
 *
 * The behavioural guarantees we pin are the ones that would silently
 * regress if someone refactored the lifecycle:
 *
 *   1. `initMermaid()` is **idempotent** for the same theme (no extra
 *      `mermaid.initialize` calls per page navigation).
 *   2. A `pre.mermaid:not([data-rendered])` node gets a `data-rendered`
 *      attribute after the next animation frame.
 *   3. Re-running on the same DOM does NOT re-render already-rendered
 *      diagrams (skips by `[data-rendered]`).
 *   4. The `astro:before-swap` handler disconnects the observer so a
 *      stale observer doesn't hold a reference to a page that's
 *      already gone.
 *
 * The `mermaid.ts` module carries module-level state (`initialized`,
 * `currentTheme`, `themeObserver`, `diagramCounter`, `renderPending`)
 * which would leak across tests otherwise — `vi.resetModules()` plus a
 * fresh dynamic import in every `it()` keeps each case hermetic.
 *
 * Timer strategy
 * --------------
 * The script schedules work via `requestAnimationFrame` (immediate
 * rendering) and `setTimeout` (150ms theme-flip debounce). The
 * pre-fix `flushAnimationFrames` helper used a fixed `count = 8`
 * `setTimeout` loops, which was timing-based and slow. We now:
 *
 *   1. Stub `requestAnimationFrame` to be **synchronous** so the
 *      first paint in the script runs immediately (no `await` on
 *      happy-dom's microtask plumbing).
 *   2. Use `vi.useFakeTimers()` for `setTimeout`/`clearTimeout` only
 *      (NOT rAF — we own rAF via the stub above). The theme-flip
 *      debounce can then be advanced deterministically with
 *      `vi.advanceTimersByTime(150)`.
 *
 * `mermaid.render` is async, so we still need `await` on a real
 * microtask flush — `await Promise.resolve()` covers the resolve
 * that the mocked render schedules. No wall-clock waits.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

type MermaidMock = {
  initialize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
};
const mermaidMock: MermaidMock = {
  initialize: vi.fn(),
  render: vi.fn(async (id: string, source: string) => ({
    svg: `<svg data-mock-id="${id}"><text>${source.slice(0, 24)}</text></svg>`,
  })),
};
vi.mock("mermaid", () => ({ default: mermaidMock }));

// happy-dom doesn't implement CSS variables, so stub
// `window.getComputedStyle` to return empty strings (the script's
// `readCssVar` helper falls back to a sensible default on empty).
const cssVarStub = (() => ({
  getPropertyValue: () => "",
})) as unknown as typeof window.getComputedStyle;
const originalGetComputedStyle = window.getComputedStyle;
const originalRequestAnimationFrame = window.requestAnimationFrame;
let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  mermaidMock.initialize.mockClear();
  mermaidMock.render.mockClear();
  window.getComputedStyle = cssVarStub;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
  document.body.innerHTML = "";

  // Own rAF: synchronous callback dispatch — no happy-dom / wall-clock
  // dependency. The mermaid script only ever calls rAF with a single
  // callback and no return-value dependency, so a simple FIFO is fine.
  rafQueue = [];
  window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as unknown as typeof window.requestAnimationFrame;
  const flushRaf = () => {
    const queue = rafQueue;
    rafQueue = [];
    for (const cb of queue) cb(performance.now());
  };

  // Fake timers cover the script's `setTimeout` (theme-flip debounce
  // and the requestIdleCallback polyfill). Real setImmediate / micro
  // tasks remain — they're how the mocked `mermaid.render` resolves.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // Stash the flushRaf helper on `window` so the test helpers below
  // can reach it without re-creating the closure every case.
  (window as unknown as { __flushRaf?: () => void }).__flushRaf = flushRaf;
});

afterEach(() => {
  vi.useRealTimers();
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.getComputedStyle = originalGetComputedStyle;
});

async function flushAfterRenders() {
  // Drive rAF first (synchronously via the stub above), then yield
  // microtasks until the queued `mermaid.render()` Promises settle.
  // The fake-timer `setTimeout` debounce is intentionally NOT advanced
  // here — only the render path runs in the helper.
  (window as unknown as { __flushRaf?: () => void }).__flushRaf?.();
  // 10 microtask yields is enough for two awaited promises
  // (ensureMermaidInitialized + mermaid.render) plus a few extras
  // for safety. We avoid `vi.runOnlyPendingTimersAsync()` here
  // because it runs timers scheduled by other tests' tear-down paths,
  // which would queue surprise rAF callbacks and inflate render counts.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// Fresh import for every case — mermaid.ts keeps module-level state.
const importFresh = async () => {
  vi.resetModules();
  return await import("@/scripts/mermaid");
};

describe("mermaid (behavioural, dom env)", () => {
  it("initializes mermaid once per theme and reuses the binding across re-runs", async () => {
    const { initMermaid } = await importFresh();

    document.body.innerHTML = '<pre class="mermaid">graph TD; A-->B;</pre>';
    await initMermaid();
    await flushAfterRenders();

    expect(mermaidMock.initialize).toHaveBeenCalledTimes(1);
    const initialOpts = mermaidMock.initialize.mock.calls[0]?.[0];
    expect(initialOpts).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
    });

    // astro:page-load re-runs initMermaid on the same theme →
    // initialize MUST NOT be called again.
    await initMermaid();
    await flushAfterRenders();
    expect(mermaidMock.initialize).toHaveBeenCalledTimes(1);
  });

  it("renders pending <pre.mermaid> nodes and marks them data-rendered='true'", async () => {
    const { initMermaid } = await importFresh();

    document.body.innerHTML = `
      <pre class="mermaid">graph LR; X-->Y;</pre>
      <pre class="mermaid">graph LR; Y-->Z;</pre>
    `;
    await initMermaid();
    await flushAfterRenders();

    const rendered = document.querySelectorAll(
      "pre.mermaid[data-rendered='true']"
    );
    expect(rendered.length).toBe(2);
    for (const node of Array.from(rendered)) {
      expect(node.innerHTML).toContain("<svg");
    }
    expect(mermaidMock.render).toHaveBeenCalledTimes(2);
  });

  it("skips already-rendered nodes on the next initMermaid pass", async () => {
    const { initMermaid } = await importFresh();

    document.body.innerHTML = '<pre class="mermaid">graph TD; A-->B;</pre>';
    await initMermaid();
    await flushAfterRenders();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);

    // Same DOM, second initMermaid — node is now [data-rendered='true']
    // so render must not be called again.
    await initMermaid();
    await flushAfterRenders();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
  });

  it("schedules a render when the new page has a diagram (post-swap)", async () => {
    // Issue 6.3: under <ClientRouter /> a bundled module script
    // executes once per browsing session, so the `pre.mermaid` check
    // would only see the FIRST page the visitor lands on. If that
    // first page has no diagram and the SECOND (post-swap) page does,
    // mermaid.render() must still be scheduled.
    //
    // Layout.astro owns the re-entry point (see solution 6.1 — "one
    // lifecycle owner"), so this test simulates Layout.astro calling
    // initMermaid() on the new page after a swap, then asserts the
    // render fires.
    const { initMermaid } = await importFresh();

    // Page A: no diagram.
    document.body.innerHTML = "<p>No diagram here.</p>";
    await initMermaid();
    await flushAfterRenders();
    expect(mermaidMock.render).not.toHaveBeenCalled();

    // View-transition swap: replace the body with a diagram and
    // call initMermaid() again (the same call Layout.astro makes
    // on `astro:page-load` after a swap).
    document.body.innerHTML =
      '<pre class="mermaid">graph LR; Swap-->Page;</pre>';
    await initMermaid();
    await flushAfterRenders();

    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    const rendered = document.querySelector(
      "pre.mermaid[data-rendered='true']"
    );
    expect(rendered).not.toBeNull();
  });

  it("disconnects the theme observer on astro:before-swap", async () => {
    const { initMermaid } = await importFresh();

    document.body.innerHTML = '<pre class="mermaid">graph TD; A-->B;</pre>';
    await initMermaid();
    await flushAfterRenders();

    // Trigger the swap lifecycle; the observer must be torn down so
    // it doesn't hold a reference to the outgoing page's DOM.
    document.dispatchEvent(new Event("astro:before-swap"));

    // After the swap, a fresh initMermaid should still work (proving
    // the module's `themeObserver` state was cleared).
    document.body.innerHTML =
      '<pre class="mermaid">graph LR; New-->Page;</pre>';
    await initMermaid();
    await flushAfterRenders();
    const rendered = document.querySelectorAll(
      "pre.mermaid[data-rendered='true']"
    );
    expect(rendered.length).toBe(1);
  });

  it("debounces the theme-flip re-render via setTimeout", async () => {
    // The mermaid script watches `data-theme` flips and re-renders
    // diagrams with the new palette after a 150ms debounce. Verify:
    //   - Immediately after the flip, no extra render fires (the
    //     existing data-rendered='true' node has been unwound to
    //     pending by the observer callback, but no mermaid.render
    //     call has happened yet).
    //   - After `vi.advanceTimersByTime(150)`, the debounced render
    //     kicks in (the existing SVG is unwound + render() re-runs).
    const { initMermaid } = await importFresh();

    document.body.innerHTML = '<pre class="mermaid">graph TD; A-->B;</pre>';
    await initMermaid();
    await flushAfterRenders();
    const initialRenders = mermaidMock.render.mock.calls.length;
    expect(initialRenders).toBeGreaterThanOrEqual(1);

    // Flip the theme → the script should NOT render synchronously.
    document.documentElement.setAttribute("data-theme", "dark");
    await flushAfterRenders();
    expect(mermaidMock.render.mock.calls.length).toBe(initialRenders);

    // Advance the 150ms debounce → setTimeout fires → scheduleRender
    // calls our synchronous rAF stub → renderAll → render() is called
    // once more. Drain rAF + microtasks after the timer advance.
    vi.advanceTimersByTime(150);
    (window as unknown as { __flushRaf?: () => void }).__flushRaf?.();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(mermaidMock.render.mock.calls.length).toBeGreaterThan(
      initialRenders
    );
  });
});
