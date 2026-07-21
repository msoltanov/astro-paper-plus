import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression tests for issues.md #35 — TOC `<summary>` focus outline.
 *
 * The mobile TOC is a `<details class="toc-mobile">` whose `<summary>`
 * needs a visible focus outline for keyboard navigation. The styling
 * lives in `src/styles/typography.css`:
 *
 *   summary {
 *     @apply focus-visible:outline-accent
 *             focus-visible:no-underline
 *             focus-visible:outline-2
 *             focus-visible:outline-offset-1
 *             focus-visible:outline-dashed;
 *   }
 *
 * This test pins the COMPILED CSS so a future Tailwind upgrade or
 * CSS rewrite that accidentally drops the focus outline is caught
 * at gate time rather than as a regression in production.
 */

const DIST_ASTRO = join(import.meta.dirname, "..", "..", "dist", "_astro");

const distExists = existsSync(DIST_ASTRO);
const describeOrSkip = distExists ? describe : describe.skip;

describeOrSkip("issues.md #35 — TOC summary focus outline", () => {
  let layoutCss = "";

  beforeAll(() => {
    // The summary focus rule ships in the layout-level bundle
    // (it's @layer base, so Astro hoists it into the Layout CSS
    // chunk rather than the per-page chunks).
    const files = readdirSync(DIST_ASTRO).filter(
      f => f.endsWith(".css") && statSync(join(DIST_ASTRO, f)).isFile()
    );
    // Find the largest CSS bundle — that's the layout/global one.
    let biggest = files[0] ?? "";
    for (const f of files) {
      if (
        statSync(join(DIST_ASTRO, f)).size >
        statSync(join(DIST_ASTRO, biggest)).size
      ) {
        biggest = f;
      }
    }
    layoutCss = readFileSync(join(DIST_ASTRO, biggest), "utf8");
  });

  it("emits a `summary:focus-visible` rule with an outline style + width", () => {
    // Tailwind's `@apply focus-visible:outline-*` compiles to
    // `outline-style: dashed; outline-width: 2px; outline-color: var(--accent)`.
    // The previous build had no focus styling at all on `<summary>` —
    // this rule is what makes the keyboard-tab focus visible.
    expect(layoutCss).toMatch(/summary:focus-visible\s*\{/);
  });

  it("the summary:focus-visible rule sets a non-zero outline-width and a dashed style", () => {
    // Extract the body of the `summary:focus-visible { ... }` block
    // and assert both width and style are non-default. The default
    // `outline-style: none` would mean "no outline at all" — that's
    // the regression we're guarding against.
    const m = layoutCss.match(/summary:focus-visible\s*\{([^}]+)\}/);
    expect(m, "summary:focus-visible rule not found").toBeTruthy();
    const body = m![1]!;
    expect(body).toMatch(/outline-width:\s*2px/);
    expect(body).toMatch(/outline-style:\s*dashed/);
    // outline-color should be tied to the accent token, not a
    // hard-coded colour — so a theme change automatically updates it.
    expect(body).toMatch(/outline-color:\s*var\(--accent\)/);
  });

  it("the TOC `<details>` carries the `toc-mobile` class so the summary rule applies", () => {
    // Even with a focus outline rule in place, a `details` whose
    // `<summary>` is rendered without a class that ties it to the
    // rule (or via a more-specific override) could lose the outline.
    // The mobile TOC must emit `<details class="toc-mobile">` for
    // its child `<summary>` to inherit the focus rule.
    //
    // We sample the HTML on a built post page rather than parsing
    // the .astro source — that catches both the source template
    // AND the build pipeline (e.g. a view-transition wrapping the
    // markup unexpectedly).
    const distHtml = join(import.meta.dirname, "..", "..", "dist");
    const html = readPostPageHtml(distHtml);
    expect(html).toMatch(/<details[^>]*class="[^"]*\btoc-mobile\b/);
  });
});

/**
 * Find any HTML file under `dist/` that contains the mobile TOC
 * `<details class="toc-mobile">`. Returns the HTML contents.
 */
function readPostPageHtml(distDir: string): string {
  // Posts in `dist/posts/.../index.html` get the TOC when frontmatter
  // sets `tocAside: true`. Walk the tree and return the first match.
  const stack: string[] = [distDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (
          entry === "_astro" ||
          entry === "_pagefind" ||
          entry === "node_modules"
        ) {
          continue;
        }
        stack.push(full);
      } else if (entry.endsWith(".html") && entry === "index.html") {
        const html = readFileSync(full, "utf8");
        if (/class="[^"]*\btoc-mobile\b/.test(html)) {
          return html;
        }
      }
    }
  }
  return "";
}
