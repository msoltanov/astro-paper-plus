/**
 * #23 MAINT — `set:html` allowlist regression test.
 *
 * `set:html` interpolates a raw HTML string into the rendered
 * page WITHOUT escaping. Every call site is a potential XSS sink
 * if the input isn't already trusted (e.g. output of `JSON.stringify`
 * over a known-safe object, an escaped JSON-LD payload from
 * `safeJsonLd`, or a sanitised embed inner from the oEmbed
 * sanitizer). This test reads every `.astro` and `.ts` file
 * under `src/` and asserts the list of `set:html` call sites
 * matches the hand-maintained allowlist below. A new `set:html`
 * introduced in a PR fails this test until it's explicitly
 * reviewed and added to the allowlist with a justification.
 *
 * If you add a new call site, also add it here with a one-line
 * comment explaining why the input is safe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

const here = dirname(urlToPath(import.meta.url));
const srcRoot = resolve(here, "..");

/**
 * Hand-maintained allowlist of every `set:html` call site in the
 * codebase, with the rationale for why the input is trusted at each
 * one. Sorted alphabetically by file for ease of diff review.
 *
 * To add a new site: include the file path + the rationale in the
 * SAME PR that introduces the `set:html` so reviewers can audit
 * the safety claim alongside the diff.
 */
const ALLOWED_SITES: ReadonlyArray<{
  file: string;
  rationale: string;
}> = [
  {
    file: "components/AudioEmbed.astro",
    rationale:
      "Output of the oEmbed sanitizer (`built.inner`) — HTML passed through a provider allowlist and an explicit tag-allowlist regex.",
  },
  {
    file: "components/Breadcrumb.astro",
    rationale:
      "Output of `safeJsonLd(structuredData)` — JSON.stringify output then escaped against `</script` and U+2028/U+2029 breakout vectors.",
  },
  {
    file: "components/VideoEmbed.astro",
    rationale:
      "Output of the oEmbed sanitizer (`built.inner`) — same path as AudioEmbed.astro.",
  },
  {
    file: "layouts/Layout.astro",
    rationale:
      "Two call sites: (a) `themeColorScriptObject()` — controlled key/value map from the resolved theme tokens, formatted as `key=value` pairs, not user input. (b) `safeJsonLd(websiteJsonLd)` — escaped JSON-LD payload as above.",
  },
  {
    file: "layouts/PostLayout.astro",
    rationale:
      "`safeJsonLd(structuredData)` — escaped JSON-LD payload as above. The post's own title/description flow through `post.data.*`, which is content-layer validated by Zod.",
  },
];

/** Recursively walk `src/` and return every `.astro` / `.ts` file
 * path RELATIVE to `srcRoot` (the keys used in the allowlist).
 * Skips `__tests__/` — test files can mention `set:html` in
 * docstrings and fixture strings without being production
 * call sites, and including them would make every test grep
 * against itself. */
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (/\.(astro|ts)$/.test(entry) && !entry.endsWith(".d.ts")) {
      yield full.slice(srcRoot.length + 1).replace(/\\/g, "/");
    }
  }
}

function findSetHtmlSites(file: string): number {
  const content = readFileSync(resolve(srcRoot, file), "utf8");
  // Match `set:html` as a JSX-like directive (preceded by whitespace
  // or attribute boundary, followed by `{`). The single regex catches
  // both `<script set:html={...} />` and `<Fragment set:html={...} />`
  // shapes — these are the only legitimate Astro call sites.
  const matches = content.match(/set:html=\{/g);
  return matches ? matches.length : 0;
}

describe("#23 — set:html allowlist", () => {
  const allFiles = Array.from(walk(srcRoot));
  const observed = new Map<string, number>();
  for (const f of allFiles) {
    const count = findSetHtmlSites(f);
    if (count > 0) observed.set(f, count);
  }

  it("every observed set:html call site is in the allowlist", () => {
    const allowedFiles = new Set(ALLOWED_SITES.map(s => s.file));
    const drift: string[] = [];
    for (const [file] of observed) {
      if (!allowedFiles.has(file)) {
        drift.push(file);
      }
    }
    expect(
      drift,
      `${drift.length} file(s) contain set:html but are NOT in the allowlist — ` +
        `either remove the call site or add it to ALLOWED_SITES in ` +
        `src/__tests__/setHtmlAllowlist.test.ts with a safety rationale. ` +
        `Drift: ${drift.join(", ")}`
    ).toEqual([]);
  });

  it("every allowlist entry matches an actual call site (no dead entries)", () => {
    // Pin the allowlist against reality so a future contributor
    // who deletes a `set:html` doesn't leave a stale allowlist
    // entry that could mask a re-introduction.
    const dead: string[] = [];
    for (const { file } of ALLOWED_SITES) {
      if (!observed.has(file)) {
        dead.push(file);
      }
    }
    expect(
      dead,
      `${dead.length} allowlist entries have no matching set:html ` +
        `in source. Either the call site was removed (clean up ` +
        `ALLOWED_SITES) or this test is reading the wrong directory. ` +
        `Dead entries: ${dead.join(", ")}`
    ).toEqual([]);
  });

  it("every allowlisted file contains the documented rationale (sanity)", () => {
    // Catches the case where a contributor adds an entry with an
    // empty or placeholder rationale. Pin the comment shape so
    // the rationale stays a sentence, not a fragment.
    for (const { rationale } of ALLOWED_SITES) {
      expect(rationale.length).toBeGreaterThan(20);
      expect(rationale).not.toMatch(/TODO|FIXME|XXX/i);
    }
  });
});
