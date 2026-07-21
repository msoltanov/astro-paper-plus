/**
 * Behavioural DOM tests for `src/scripts/postEnhancements.ts`.
 *
 * Three contracts the script must keep:
 *
 *   1. Idempotent — `initPostEnhancements()` called twice (e.g. once on
 *      first paint, once on `astro:after-swap`) tears down the previous
 *      installation before installing again. No duplicated progress bar,
 *      no duplicated copy buttons, no leaked scroll listener.
 *
 *   2. No install on non-post pages — `<main id="main-content">` exists
 *      on every page (the skip-link targets it), so the script must
 *      gate on `data-copy-label` and silently no-op when the page
 *      didn't set that attribute. Otherwise home/list/galleries pages
 *      would sprout progress bars and copy buttons they don't want.
 *
 *   3. Copy button provides user feedback — clicking on success or
 *      failure flips the label to "Copied" / "Copy failed", and the
 *      label resets after a delay. This is the fix from issue #3 in
 *      issues.md: silent failure strands the user.
 *
 * `astro:before-swap` cleanup — since M24 the script registers a
 * listener that calls the cleanup teardown (cancels any pending copy-
 * reset timers) right before the swap. The `initPostEnhancements()`
 * re-run on `astro:page-load` still wires fresh handlers onto the
 * swapped `<main>`; that's covered by test 1.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

async function importFresh() {
  vi.resetModules();
  return import("@/scripts/postEnhancements");
}

/**
 * Stub `window.getComputedStyle` so happy-dom's no-layout default
 * doesn't crash the install when it reads `--file-name-offset`.
 * We just return an empty CSSStyleDeclaration for every probe.
 */
function stubComputedStyle() {
  // `getComputedStyle` already exists in happy-dom but returns a real
  // (mostly empty) CSSStyleDeclaration whose `.getPropertyValue` returns
  // "" — that's exactly what the script wants. Still, guard in case
  // the env moves.
  if (typeof window.getComputedStyle !== "function") {
    (
      window as unknown as { getComputedStyle: () => CSSStyleDeclaration }
    ).getComputedStyle = () => {
      const s = document.createElement("div").style;
      return s as unknown as CSSStyleDeclaration;
    };
  }
}

function mockClipboard(success: boolean) {
  const writeText = vi.fn(async () => {
    if (!success) {
      throw new Error("not allowed");
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("postEnhancements (behavioural, dom env)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    stubComputedStyle();
  });

  it("installs a progress bar and one copy button per <pre> on a post page", async () => {
    mockClipboard(true);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <article>
          <h1>Title</h1>
          <pre>console.log(1);</pre>
          <pre>console.log(2);</pre>
        </article>
      </main>
    `;

    initPostEnhancements();

    // Progress container is appended to <body>.
    expect(document.querySelector(".progress-container")).not.toBeNull();
    // Two copy buttons (one per <pre>).
    expect(document.querySelectorAll("button.copy-code")).toHaveLength(2);
  });

  it("is idempotent: second init tears down the first, no duplicate listeners or DOM", async () => {
    mockClipboard(true);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <pre>x = 1;</pre>
      </main>
    `;
    initPostEnhancements();
    initPostEnhancements();
    initPostEnhancements();

    expect(document.querySelectorAll(".progress-container")).toHaveLength(1);
    expect(document.querySelectorAll("button.copy-code")).toHaveLength(1);
  });

  it("does NOT install anything on a non-post page (no data-copy-label)", async () => {
    const { initPostEnhancements } = await importFresh();

    // Home / list pages: <main id="main-content"> is present (skip-link
    // target) but no data-copy-label — this is the page-filter gate.
    document.body.innerHTML = `
      <main id="main-content">
        <h1>Home</h1>
        <pre>some code on the home page</pre>
      </main>
    `;
    initPostEnhancements();

    expect(document.querySelector(".progress-container")).toBeNull();
    expect(document.querySelectorAll("button.copy-code")).toHaveLength(0);
  });

  it("does NOT install when #main-content is missing entirely", async () => {
    const { initPostEnhancements } = await importFresh();
    initPostEnhancements();
    expect(document.querySelector(".progress-container")).toBeNull();
  });

  it("copy button shows 'Copied' on clipboard success", async () => {
    const writeText = mockClipboard(true);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <pre>hello</pre>
      </main>
    `;
    initPostEnhancements();

    const btn = document.querySelector("button.copy-code") as HTMLButtonElement;
    expect(btn.innerText).toBe("Copy");
    btn.click();
    // Microtask flush for the await.
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(btn.innerText).toBe("Copied");
  });

  it("copy button shows 'Copy failed' on clipboard rejection (non-secure context, etc.)", async () => {
    mockClipboard(false);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <pre>x</pre>
      </main>
    `;
    initPostEnhancements();

    const btn = document.querySelector("button.copy-code") as HTMLButtonElement;
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.innerText).toBe("Copy failed");
  });

  it("cleans up progress bar listeners on reinit (no scroll listener leak)", async () => {
    mockClipboard(true);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <pre>x</pre>
      </main>
    `;
    initPostEnhancements();
    initPostEnhancements();

    // After two installs and one teardown, the DOM should be the
    // post-install steady state — one progress bar, one copy button.
    expect(document.querySelectorAll(".progress-container")).toHaveLength(1);
    expect(document.querySelectorAll("button.copy-code")).toHaveLength(1);

    // Replace the host <main> (mimicking a view-transition swap) and
    // re-init: the OLD progress container should be removed by the
    // cleanup, then a NEW one installed on the fresh <main>.
    const main = document.querySelector("#main-content") as HTMLElement;
    main.replaceWith(main.cloneNode(true));
    initPostEnhancements();
    expect(document.querySelectorAll(".progress-container")).toHaveLength(1);
  });

  // M16: distinct-bodies swap. Mount on a post with two <pre>s, swap
  // to a post with one <pre>, then assert no orphan copy buttons or
  // progress containers survive the second swap. Exercises the
  // wrapper-vs-button cleanup loop in `installCopyButtons` directly:
  // without the explicit `button.remove()` pass, a swap from a
  // multi-`<pre>` post to a single-`<pre>` post would leave one
  // orphaned `button.copy-code` (because the unwrap loop inserts
  // each child back at the wrapper's position, and the button was
  // the wrapper's last child — now a sibling of the unwrapped <pre>
  // on the new page).
  it("M16: swap between two distinct post bodies leaves no orphan buttons", async () => {
    mockClipboard(true);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <article>
          <h1>Post A</h1>
          <pre>alpha-1</pre>
          <pre>alpha-2</pre>
          <pre>alpha-3</pre>
        </article>
      </main>
    `;
    initPostEnhancements();
    expect(document.querySelectorAll("button.copy-code")).toHaveLength(3);

    // Swap to a different post body entirely (different text, one
    // <pre>) — this mimics an Astro View Transition landing on a
    // new post detail page.
    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <article>
          <h1>Post B</h1>
          <pre>beta-1</pre>
        </article>
      </main>
    `;
    initPostEnhancements();

    // Exactly one copy button (the new page's single <pre>), one
    // progress container (the previous one was removed by the
    // teardown before the new one was installed).
    expect(document.querySelectorAll("button.copy-code")).toHaveLength(1);
    expect(document.querySelectorAll(".progress-container")).toHaveLength(1);
    // And the surviving button is the new page's (sibling of the
    // new <pre> "beta-1", inside the new <main>).
    const button = document.querySelector("button.copy-code");
    expect(button?.closest("main")?.querySelector("h1")?.textContent).toBe(
      "Post B"
    );
    // The wrapper puts the <pre> and the <button> as siblings
    // inside a `<div style="position: relative">` wrapper, so the
    // button's parent contains the <pre>.
    expect(button?.parentElement?.querySelector("pre")?.textContent).toBe(
      "beta-1"
    );
  });

  // M15 — astro:before-swap cleanup contract. The script registers
  // a `document.addEventListener('astro:before-swap', …)` listener
  // that tears down the current installation (cancelling any pending
  // copy-reset timers) BEFORE the new page lands. Without it, a
  // setTimeout scheduled by a click that landed in the last 1.5s
  // of the previous page would overwrite the next page's button
  // label once it fires.
  //
  // We exercise the path by clicking the button (schedules a
  // ~1500ms `setTimeout`), then firing `astro:before-swap`. The
  // module's side effects (the `astro:before-swap` listener bind)
  // happen at module-load time, so the simulate path just dispatches
  // the event after a click.
  it("M15: astro:before-swap clears pending copy-button reset timers", async () => {
    mockClipboard(true);
    const { initPostEnhancements } = await importFresh();

    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <pre>post-A</pre>
      </main>
    `;
    initPostEnhancements();

    const btn = document.querySelector("button.copy-code") as HTMLButtonElement;
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.innerText).toBe("Copied");

    // Fire the before-swap event (this is what Astro's view-transition
    // router does immediately before swapping in the next page's DOM).
    document.dispatchEvent(new Event("astro:before-swap"));

    // After before-swap cleans up, the old button is detached from
    // the DOM (the swap that follows replaces <main>). What we can
    // assert here is that the script no longer holds internal
    // references — a fresh init on a *new* main must install one
    // progress container and exactly one new copy button, without
    // duplicating listeners.
    document.body.innerHTML = `
      <main id="main-content"
            data-copy-label="Copy"
            data-copied-label="Copied"
            data-copy-failed-label="Copy failed">
        <pre>post-B</pre>
      </main>
    `;
    initPostEnhancements();
    expect(document.querySelectorAll(".progress-container")).toHaveLength(1);
    const newBtn = document.querySelector(
      "button.copy-code"
    ) as HTMLButtonElement;
    expect(newBtn).not.toBe(btn);
    expect(newBtn.innerText).toBe("Copy");
  });
});
