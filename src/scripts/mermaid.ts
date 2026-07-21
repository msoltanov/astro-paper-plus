/**
 * Client-side Mermaid initializer.
 *
 * The remark plugin (`src/utils/remarkMermaid.ts`) emits `<pre class="mermaid">`
 * placeholders during build. This script:
 * 1. Picks up the current light/dark theme from `<html data-theme>`.
 * 2. Initializes Mermaid once with theme variables that play nicely with
 *    AstroPaper+'s `--color-*` CSS variables.
 * 3. Renders any pending `pre.mermaid:not([data-rendered])` nodes in the DOM.
 * 4. Re-runs on `astro:page-load` so the diagrams survive View Transitions.
 *
 * Errors are surfaced as a readable banner so authors notice when their
 * diagram source has a syntax issue.
 */
import mermaid from "mermaid";

const HTML = document.documentElement;

type Palette = {
  background: string;
  primaryColor: string;
  primaryTextColor: string;
  primaryBorderColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  lineColor: string;
  textColor: string;
  mainBkg: string;
  nodeBorder: string;
  clusterBkg: string;
  clusterBorder: string;
  titleColor: string;
  edgeLabelBackground: string;
  fontFamily: string;
};

function readCssVar(name: string, fallback: string): string {
  const v = getComputedStyle(HTML).getPropertyValue(name).trim();
  return v || fallback;
}

function paletteForTheme(): Palette {
  const isDark = (HTML.dataset.theme ?? "light") === "dark";
  return {
    background: readCssVar(
      "--color-background",
      isDark ? "#0b0d12" : "#ffffff"
    ),
    primaryColor: readCssVar("--color-muted", isDark ? "#1f2937" : "#f3f4f6"),
    primaryTextColor: readCssVar(
      "--color-foreground",
      isDark ? "#e5e7eb" : "#1f2937"
    ),
    primaryBorderColor: readCssVar(
      "--color-border",
      isDark ? "#374151" : "#d1d5db"
    ),
    secondaryColor: readCssVar(
      "--color-secondary",
      isDark ? "#111827" : "#f9fafb"
    ),
    tertiaryColor: readCssVar("--color-accent", isDark ? "#374151" : "#fef3c7"),
    lineColor: readCssVar(
      "--color-muted-foreground",
      isDark ? "#9ca3af" : "#6b7280"
    ),
    textColor: readCssVar("--color-foreground", isDark ? "#e5e7eb" : "#1f2937"),
    mainBkg: readCssVar("--color-background", isDark ? "#0b0d12" : "#ffffff"),
    nodeBorder: readCssVar("--color-border", isDark ? "#374151" : "#d1d5db"),
    clusterBkg: readCssVar("--color-muted", isDark ? "#1f2937" : "#f3f4f6"),
    clusterBorder: readCssVar("--color-border", isDark ? "#374151" : "#d1d5db"),
    titleColor: readCssVar("--color-accent", isDark ? "#fbbf24" : "#b45309"),
    edgeLabelBackground: readCssVar(
      "--color-background",
      isDark ? "#0b0d12" : "#ffffff"
    ),
    fontFamily:
      "var(--font-google-sans-code, ui-sans-serif, system-ui, sans-serif)",
  };
}

let initialized = false;
let currentTheme: string | null = null;
let themeObserver: MutationObserver | null = null;
let renderPending = false;
let themeReRenderTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureMermaidInitialized(): Promise<void> {
  const themeKey = HTML.dataset.theme ?? "light";
  if (initialized && currentTheme === themeKey) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "strict",
    fontFamily: paletteForTheme().fontFamily,
    themeVariables: paletteForTheme(),
  });
  initialized = true;
  currentTheme = themeKey;
}

function pendingNodes(): HTMLElement[] {
  // `Array.from` to silence the live-collection typing
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "pre.mermaid:not([data-rendered]):not(.mermaid-error)"
    )
  );
}

function markError(node: HTMLElement, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  node.classList.add("mermaid-error");
  // P3-4: `role="alert"` triggers a screen-reader announcement as
  // soon as the element enters the accessibility tree — without
  // it, a syntactically-broken Mermaid diagram silently fails to
  // render with no diagnostic at all (the source string is wiped
  // by the next textContent write below, leaving only an unwrap-
  // style empty `pre.mermaid`).
  node.setAttribute("role", "alert");
  // Replace the escaped diagram source so the user can copy it back to fix.
  const src = node.textContent ?? "";
  node.textContent = `⚠️ Mermaid syntax error: ${message}\n\n${src}`;
}

function stashSource(node: HTMLElement): string {
  // Preserve the diagram source so theme changes can re-render the SVG.
  let source = node.dataset.source ?? "";
  if (!source) {
    source = node.textContent ?? "";
    node.dataset.source = source;
  }
  return source;
}

async function renderAll(): Promise<void> {
  const nodes = pendingNodes();
  if (nodes.length === 0) return;
  await ensureMermaidInitialized();
  // M35 (issues.md): render in parallel with `Promise.all` rather than
  // a serial `for await`. For posts with 5+ diagrams this collapses
  // ~700ms of serial main-thread work into a single batch. Safety:
  // (a) each render targets a distinct `<pre>` node, so the
  // `replaceChildren` mutations don't race. (b) Mermaid's internal
  // SVG-defs collisions no longer happen because the node id uses
  // `crypto.randomUUID()` — `mermaid-0` / `mermaid-1` duplicates were
  // the historical parallel-render hazard. (c) Per-node failures
  // stay isolated via the inner `try/catch` (each Promise resolves
  // or rejects independently).
  await Promise.all(nodes.map(renderOne));
}

async function renderOne(node: HTMLElement): Promise<void> {
  try {
    const source = stashSource(node);
    node.setAttribute("data-rendered", "pending");
    // P3-7: use a globally-unique id rather than a module-scope
    // counter. The counter was vulnerable to a parallel-render
    // scope (e.g. two `initMermaid()` calls firing at the same
    // time across Astro's view-transition lifecycle) producing
    // duplicate `mermaid-0` ids in the document. The random
    // suffix makes collisions effectively impossible without
    // needing to coordinate counters across the module.
    const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`;
    const result = await mermaid.render(id, source);
    // P1-8: parse the SVG string into a real DOM subtree rather
    // than assigning to `innerHTML`. Direct `innerHTML = …`
    // assignment is the one usage in the five client scripts that
    // bypasses the browser's HTML-parser security; routing through
    // `DOMParser` + `replaceChildren` means a future config change
    // (e.g. loosening `securityLevel: "strict"`) doesn't
    // re-open the script-injection vector on this code path.
    // Comment matched against the issue tracker in issues.md.
    const docElement = new DOMParser().parseFromString(
      result.svg,
      "image/svg+xml"
    ).documentElement;
    // The DOMParser always returns a non-null `documentElement` for
    // a well-formed XML payload; if Mermaid ever emits malformed
    // XML (shouldn't happen with `securityLevel: "strict"`) the
    // returned tree is `<parsererror>` and `replaceChildren` would
    // render that error verbatim — which is more diagnostic than
    // silently crashing. We replace with the SVG root itself
    // (rather than its children) so the rendered diagram keeps its
    // outer `<svg>` element — a real `<svg>` root is what every
    // browser-level layout (zoom, pan, viewBox sizing, …) expects.
    node.replaceChildren(docElement);
    node.removeAttribute("data-rendered");
    node.setAttribute("data-rendered", "true");
  } catch (err) {
    node.removeAttribute("data-rendered");
    markError(node, err);
  }
}

function scheduleRender(): void {
  // Guard: only one rAF-based render pass scheduled at a time.
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    void renderAll();
  });
}

export async function initMermaid(): Promise<void> {
  // P2-27: SSR guard. Mermaid needs `document` / `matchMedia` /
  // `MutationObserver` — all browser-only. An SSR import would
  // crash on the first line. Mirrors `backToTopButton.ts` /
  // `galleryLightbox.ts` style.
  if (typeof window === "undefined") return;
  // Clean up the previous observer + listener if re-initializing
  // (e.g. after a View Transition to a new page with diagrams).
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }

  scheduleRender();

  // Watch for theme flips (the theme.ts script flips `data-theme` on
  // <html>; render again with the new palette).
  themeObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "data-theme") {
        // Theme changed → re-render all (including already-rendered ones,
        // since their SVG carries the old palette).
        initialized = false;
        document
          .querySelectorAll<HTMLElement>("pre.mermaid[data-rendered='true']")
          .forEach(el => {
            el.removeAttribute("data-rendered");
            el.textContent = el.dataset.source ?? "";
          });
        // Debounce: if the user toggles rapidly, only re-render once
        // after they stop for 150ms.
        if (themeReRenderTimer) clearTimeout(themeReRenderTimer);
        themeReRenderTimer = setTimeout(() => scheduleRender(), 150);
      }
    }
  });
  themeObserver.observe(HTML, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  // The `astro:page-load` re-entry is handled by Layout.astro's mermaid
  // check — that's the single lifecycle owner. No need to add another
  // handler here.
}

// Disconnect the theme observer before swap so it doesn't hold a reference
// to the old page's DOM. P3-6: also clear the pending `setTimeout`
// debounce — without this, a swap that fires while a theme-flip
// debounce is queued would re-render the OLD page's diagrams
// against the NEW page's theme once the timer fires.
document.addEventListener("astro:before-swap", () => {
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
  if (themeReRenderTimer) {
    clearTimeout(themeReRenderTimer);
    themeReRenderTimer = null;
  }
});

export default initMermaid;
