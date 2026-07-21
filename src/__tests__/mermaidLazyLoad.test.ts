import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Smoke tests for issues.md #26 — Mermaid dynamic-import laziness.
 *
 * The Mermaid renderer is ~700 KB minified; statically importing
 * it on every page would tank Lighthouse / INP scores for posts
 * that don't have diagrams (which is most of the site). The
 * Layout.astro lazy-loads it via `import("@/scripts/mermaid")` only
 * when at least one `<pre class="mermaid">` placeholder is present
 * in the current page, and re-runs the loader on `astro:page-load`
 * to pick up diagrams that arrive via View Transitions.
 *
 * These tests pin BOTH halves:
 *
 *   1. The Layout source uses `document.querySelector("pre.mermaid")`
 *      before triggering the dynamic import (so a Mermaid-less page
 *      never fetches the bundle).
 *   2. The compiled Layout JS uses an `import(...)` (dynamic), not
 *      a top-level `import` (static), so the bundler emits a separate
 *      chunk rather than inlining Mermaid into every page.
 *
 * Source-only check (Layout.astro) and build-output check
 * (dist/_astro/Layout.*.js) are separate assertions because the
 * bundler's transformation is what actually delivers the perf
 * win — a future editor could rewrite Layout.astro in a way that
 * *looks* lazy but compiles to a static import, and only the
 * build-output check would catch it.
 */

const layoutSrc = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "layouts", "Layout.astro"),
  "utf8"
);

function readCompiledLayoutJs(): string {
  // Astro emits Layout scripts as `Layout.astro_astro_type_script_index_N_lang.*.js`.
  // We scan dist/_astro for any file whose name matches the pattern;
  // they share the source file, so reading any one is enough for the
  // import-shape assertion.
  const dir = join(import.meta.dirname, "..", "..", "dist", "_astro");
  if (!existsSync(dir)) return "";
  const entries = readdirSync(dir);
  const target = entries.find(
    f =>
      f.startsWith("Layout.astro_astro_type_script_index_") && f.endsWith(".js")
  );
  if (!target) return "";
  return readFileSync(join(dir, target), "utf8");
}

describe("issues.md #26 — Mermaid dynamic-import laziness", () => {
  it("Layout.astro gates the Mermaid dynamic-import on a `pre.mermaid` query", () => {
    // The exact pattern in Layout.astro.astro:
    //   if (document.querySelector("pre.mermaid")) {
    //     void import("@/scripts/mermaid").then(m => m.initMermaid());
    //   }
    // We assert both halves of the gate — the existence of the
    // selector check AND the `import(...)` call. A future refactor
    // that, say, always imports Mermaid (no selector check) is caught
    // here before it ships a static bundle import.
    expect(layoutSrc).toMatch(
      /document\.querySelector\(["']pre\.mermaid["']\)/
    );
    expect(layoutSrc).toMatch(/import\(["']@\/scripts\/mermaid["']\)/);
  });

  it("Layout.astro re-binds the loader to `astro:page-load` for View Transition pages", () => {
    // The lazy-load helper runs once on first parse AND on every
    // `astro:page-load` event so View Transition navigations to a
    // page with a Mermaid diagram also trigger the import. Without
    // this, a View-Transition-rendered diagram shows the placeholder
    // `<pre class="mermaid">` text forever.
    expect(layoutSrc).toMatch(/astro:page-load/);
  });

  it("Layout.astro does NOT use a static (top-level) import of `@/scripts/mermaid`", () => {
    // A static import would tell the bundler to inline Mermaid into
    // the layout chunk, defeating the lazy-load. The source uses the
    // dynamic form `import("@/scripts/mermaid")` (parens + quoted
    // specifier) — make sure no static `import x from "@/scripts/mermaid"`
    // line sneaks in.
    expect(layoutSrc).not.toMatch(
      /^\s*import\s+[\w*\{\}, ]+\s+from\s+["']@\/scripts\/mermaid["']/m
    );
  });

  it("the compiled layout script emits a dynamic `import(...)` for Mermaid (when built)", () => {
    // Belt-and-braces against a bundler upgrade that flips the
    // dynamic import back to a static one. We read the build output
    // and check for a `import("./mermaid…")` or `import("@/scripts/mermaid")`
    // call site — not a top-level `import` binding.
    const compiled = readCompiledLayoutJs();
    if (!compiled) return; // dist/ not present in this environment
    expect(compiled).toMatch(/querySelector\(["'`]pre\.mermaid["'`]\)/);
    // Dynamic-import call site (parens around the import expression).
    expect(compiled).toMatch(/import\(["'`](\.\/mermaid|@\/scripts\/mermaid)/);
  });
});
