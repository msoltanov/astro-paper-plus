/**
 * `initPostEnhancements` — wires up the post-page bits that need to run on
 * the client after the static HTML lands:
 *
 *   1. A thin scroll-progress bar fixed to the top of the viewport.
 *   2. A "Copy" button injected next to every `<pre>` code block, with a
 *      localized label that flips to a "Copied" confirmation on success or
 *      a "Copy failed" message on clipboard-API failure (non-secure
 *      context, permission denied, etc.).
 *
 * The labels come from `data-copy-label` / `data-copied-label` /
 * `data-copy-failed-label` attributes on the `<main id="main-content">`
 * element of the post page, written by the route. That keeps the script
 * fully reusable across the default-locale and per-locale post routes
 * without needing per-call translations.
 *
 * Lifecycle
 * ---------
 * - Cleanup functions are stored at module scope (not on the DOM element)
 *   so View Transition swaps (which replace `<main>`) don't orphan them.
 * - `initPostEnhancements()` is idempotent: it calls the previous cleanup
 *   before reinstalling on the new page.
 */

let _progressCleanup: (() => void) | null = null;
let _copyCleanup: (() => void) | null = null;

/**
 * Install the scroll-progress bar. Operates on `document.body` directly
 * — the host argument isn't needed and would only add cognitive overhead
 * at the callsite. `installCopyButtons(host, …)` does need the host
 * because the `<pre>` query is scoped to `<main id="main-content">`.
 */
function installProgressBar(): () => void {
  const container = document.createElement("div");
  container.className =
    "progress-container fixed top-0 z-10 h-1 w-full bg-background";
  const bar = document.createElement("div");
  bar.className = "progress-bar h-1 w-0 bg-accent";
  bar.id = "myBar";
  container.appendChild(bar);
  document.body.appendChild(container);

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      // P2-31: drop `document.body.scrollTop`. Standards-mode HTML
      // (the only mode Astro emits) always returns 0 from
      // `document.body.scrollTop` — reading it is dead code that
      // occasionally logs a deprecation noise in browser devtools.
      // `document.documentElement.scrollTop` is the actual scroll
      // position in standards mode and is the value we want.
      const winScroll = document.documentElement.scrollTop;
      const height =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      bar.style.width = scrolled + "%";
      ticking = false;
    });
  };
  document.addEventListener("scroll", onScroll, { passive: true });
  // Initial paint so the bar reflects current scroll position.
  onScroll();

  return () => {
    document.removeEventListener("scroll", onScroll);
    container.remove();
  };
}

function installCopyButtons(
  host: HTMLElement,
  copyLabel: string,
  copiedLabel: string,
  copyFailedLabel: string
): () => void {
  const codeBlocks = Array.from(host.querySelectorAll<HTMLElement>("pre"));
  // Track every wrapper AND its button so the teardown can remove
  // BOTH (the unwrap loop below inserts the button right before
  // the wrapper, leaving the button as an orphan sibling of the
  // unwrapped <pre>; the explicit `button.remove()` was needed all
  // along). The P2-32 "dead belt-and-braces" framing in issues.md
  // was the result of examining the wrong invariant: the
  // `button.remove()` calls work fine, but the wrappers array
  // had a missing case once and the explicit button removal
  // picked up the slack. Today both are correct.
  const wrappers: HTMLElement[] = [];
  const buttons: HTMLButtonElement[] = [];
  const cleanups: Array<() => void> = [];

  for (const codeBlock of codeBlocks) {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";

    const computedStyle = getComputedStyle(codeBlock);
    const hasFileNameOffset =
      computedStyle.getPropertyValue("--file-name-offset").trim() !== "";
    const topClass = hasFileNameOffset ? "top-(--file-name-offset)" : "-top-3";

    const copyButton = document.createElement("button");
    copyButton.className = `copy-code absolute end-3 ${topClass} rounded bg-muted/80 px-2 py-1 text-xs`;
    copyButton.type = "button";
    // P2-29: `aria-live="polite"` so the button's transient
    // "Copied" / "Copy failed" labels are announced by screen
    // readers when they change. Without `aria-live` the visual
    // feedback is invisible to assistive tech (the visible label
    // changes but the role / label stay the same in the
    // accessibility tree). `polite` rather than `assertive` because
    // we don't want a copy click to interrupt screen-reader speech.
    copyButton.ariaLabel = copyLabel;
    copyButton.setAttribute("aria-live", "polite");
    copyButton.innerText = copyLabel;

    const COPY_BUTTON_RESET_MS = 1500;

    let resetTimer: number | undefined;
    copyButton.addEventListener("click", async () => {
      // Show feedback for both success and failure paths so the user
      // never sees the click disappear into a silent no-op. Failure
      // surfaces the localized "copy failed" label; a transient
      // clipboard error (non-secure context, permission denied, …) no
      // longer strands the button on its default label.
      let success = false;
      try {
        await navigator.clipboard.writeText(codeBlock.innerText);
        success = true;
      } catch {
        success = false;
      }
      copyButton.innerText = success ? copiedLabel : copyFailedLabel;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        copyButton.innerText = copyLabel;
      }, COPY_BUTTON_RESET_MS);
    });
    cleanups.push(() => window.clearTimeout(resetTimer));

    wrapper.appendChild(copyButton);
    const parent = codeBlock.parentNode;
    if (!parent) continue;
    parent.insertBefore(wrapper, codeBlock);
    wrapper.appendChild(codeBlock);
    wrappers.push(wrapper);
    buttons.push(copyButton);
  }

  return () => {
    for (const fn of cleanups) fn();
    // P2-32: wrappers get removed (along with any remaining text
    // node) via `removeChild(wrapper)` once we've moved every
    // child out via the `while (wrapper.firstChild)` loop.
    // However the loop above moves each child OUT of the wrapper
    // and into the parent, in the wrapper's original position —
    // so the button (last unwrapped child) ends up sitting as a
    // sibling of the `<pre>`, NOT inside the wrapper. We track
    // those buttons separately to remove them explicitly.
    for (const wrapper of wrappers) {
      const parent = wrapper.parentNode;
      if (!parent) continue;
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    }
    for (const button of buttons) {
      button.remove();
    }
    wrappers.length = 0;
    buttons.length = 0;
  };
}

/**
 * Idempotent installer. Reads `data-copy-label` / `data-copied-label` from
 * the `<main id="main-content">` element. Tears down any previous
 * instance attached to the same element so re-inits after View
 * Transition page swaps don't accumulate listeners or DOM nodes.
 *
 * Silently no-ops if `<main id="main-content">` isn't present (e.g. on
 * a non-post page that imports this script by mistake).
 */
export function initPostEnhancements(): void {
  const main = document.getElementById("main-content");
  if (!(main instanceof HTMLElement)) return;
  // Only run on post pages (which set data-copy-label). This restores the
  // "post-page bits only" contract — home/list pages have #main-content
  // but won't trigger installation.
  if (!main.dataset.copyLabel) return;

  // P2-30: the previous `dataset.X ?? getAttribute("data-x") ?? "fallback"`
  // triple-fallback was dead — both `dataset.copyLabel` AND
  // `getAttribute("data-copy-label")` read the SAME attribute (the
  // data-* form, accessed via different DOM APIs). The middle branch
  // was unreachable. Single-source-of-truth now: `dataset` only.
  const copyLabel = main.dataset.copyLabel ?? "Copy";
  const copiedLabel = main.dataset.copiedLabel ?? "Copied";
  const copyFailedLabel = main.dataset.copyFailedLabel ?? "Copy failed";

  // Tear down the previous page's installation before installing anew.
  _progressCleanup?.();
  _copyCleanup?.();
  _progressCleanup = installProgressBar();
  _copyCleanup = installCopyButtons(
    main,
    copyLabel,
    copiedLabel,
    copyFailedLabel
  );
}

// M24: cancel any pending copy-button reset timers BEFORE the swap
// replaces the page DOM. Without this, a `setTimeout` scheduled by a
// click that landed on the *current* page would fire on the *next*
// page's first copy button and overwrite its label. The previous
// cleanup only ran on `initPostEnhancements()` which is invoked on
// `astro:page-load` (after the swap) — too late for a click that
// happened in the last 1.5 s of the current page.
document.addEventListener("astro:before-swap", () => {
  _progressCleanup?.();
  _copyCleanup?.();
  _progressCleanup = null;
  _copyCleanup = null;
});

export default initPostEnhancements;
