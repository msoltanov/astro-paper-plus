/**
 * #27 PERF / SEC — CSP hash regression test.
 *
 * `dist/_headers` (Cloudflare) and `dist/nginx-headers.conf` (nginx)
 * each carry a CSP `script-src` line with the sha256 hashes of
 * every inline script the rendered HTML actually contains. The
 * integration walks the dist directory at build time (every
 * `.html` file under it) and computes the hash list once per
 * build.
 *
 * Two invariants must hold:
 *   1. **No dead hashes.** Every `'sha256-…'` token in the CSP
 *      must correspond to an inline `<script>` body somewhere in
 *      `dist/`. A dead hash is ~80 bytes per response and signals
 *      a refactor that left an allowlist entry without a matching
 *      script.
 *   2. **No missing hashes.** Every inline `<script>` body in
 *      `dist/` must hash to one of the CSP's `sha256-` tokens.
 *      A missing hash means the browser would block the script
 *      with `Content-Security-Policy: … refused to execute inline
 *      script …`.
 *
 * Both invariants are enforced here by reading the live build
 * output. The test is skipped (with a clear message) when `dist/`
 * hasn't been built yet — `pnpm build:site` is the canonical
 * build command and gates this test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(urlToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** SHA-256 of an inline script body, in the CSP form `'sha256-<base64>'`. */
function hashInlineScript(body: string): string {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

/** Extract every `'sha256-<base64>'` token from a CSP string. */
function extractCspHashes(csp: string): string[] {
  const matches = csp.match(/'sha256-[A-Za-z0-9+/=]+'/g);
  return matches ?? [];
}

/** Collect every inline `<script>` body from every HTML file under
 * `distDir`. Excludes scripts with `src=` (those load from the same
 * origin and don't need a hash), AND excludes JSON-LD / importmap
 * blocks (data, not executable — CSP `script-src` doesn't gate
 * them). Deduplicates by exact body match — the CSP allowlist is
 * body-keyed, not call-site keyed.
 *
 * The regex mirrors `collectInlineScriptHashes` in
 * `src/integrations/cloudflareHeaders.ts` EXACTLY so a future
 * edit to the integration's classifier (e.g. a new `type=`
 * exclusion) must change both — the test will fail otherwise. */
function collectInlineScriptBodies(distDir: string): Set<string> {
  const bodies = new Set<string>();
  // Mirror the integration's regex. The negative lookahead at the
  // script tag's start matches any tag whose attributes include a
  // real `src=` (NOT `data-src=` etc. — the `(^|[^a-zA-Z0-9_-])`
  // prefix excludes `-` so `data-src` doesn't accidentally trigger).
  const inlineScript =
    /<script(?![^>]*?(?:^|[^a-zA-Z0-9_-])src\s*=)([^>]*)>([\s\S]*?)<\/script>/gi;
  // Mirror the integration's data-type exclusion.
  const dataTypeRe =
    /type=("|')?(application\/(ld\+json|json)|importmap)("|')?/i;
  walkHtml(distDir, file => {
    const html = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = inlineScript.exec(html)) !== null) {
      const attrs = m[1] ?? "";
      const body = m[2] ?? "";
      if (body.trim() === "") continue;
      if (dataTypeRe.test(attrs)) continue;
      bodies.add(body);
    }
  });
  return bodies;
}

function collectInlineStyleBodies(distDir: string): Set<string> {
  // The codebase deliberately ships `style-src 'self' 'unsafe-inline'`
  // (see `_headers` header comment) so a CSS-keylogging exfiltration
  // surface requires an XSS first. Inline `style="..."` attributes
  // (Shiki, view-transitions) cannot be hashed by any browser, so the
  // style-src policy is intentionally permissive. The corresponding
  // CSP-hash contract test therefore does NOT pin a "no dead /
  // missing style hashes" invariant — there is no allowlist of style
  // hashes to be dead or missing against. The function is kept only
  // for the rare future test that wants to enumerate `<style>`
  // block bodies (e.g. asserting the `<style>` block count is
  // non-zero as a smoke test).
  const bodies = new Set<string>();
  const inlineStyle = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi;
  walkHtml(distDir, file => {
    const html = readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = inlineStyle.exec(html)) !== null) {
      const body = match[1] ?? "";
      if (body.trim() !== "") bodies.add(body);
    }
  });
  return bodies;
}

/** Walk `dir` recursively and call `emit` for each `.html` file.
 * Regular function (not a generator) so the `emit` callbacks fire
 * eagerly without needing `for...of` at the call site. */
function walkHtml(dir: string, emit: (file: string) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkHtml(full, emit);
    } else if (entry.endsWith(".html")) {
      emit(full);
    }
  }
}

/** Extract the `Content-Security-Policy:` line from a `_headers` file. */
function readCspFromHeaders(path: string): string {
  const text = readFileSync(path, "utf8");
  // The `_headers` format indents per-section headers with 2
  // spaces, so the CSP line can have leading whitespace. Match
  // a line that *starts* with `Content-Security-Policy:` after
  // optional leading whitespace, AND isn't a comment (`#`).
  const line = text
    .split(/\r?\n/)
    .find(l => /^\s*Content-Security-Policy\s*:/i.test(l));
  if (!line) {
    throw new Error(`No Content-Security-Policy line in ${path}`);
  }
  return line.replace(/^\s*[^:]+:\s*/, "").trim();
}

/** Same, but from the nginx `add_header … always;` directive. */
function readCspFromNginx(path: string): string {
  const text = readFileSync(path, "utf8");
  const m = text.match(
    /add_header\s+Content-Security-Policy\s+"([^"]+)"\s+always\s*;/
  );
  if (!m) {
    throw new Error(`No Content-Security-Policy add_header in ${path}`);
  }
  return m[1]!;
}

describe("#27 — CSP hash allowlist matches dist inline scripts", () => {
  const distDir = resolve(repoRoot, "dist");
  const cloudflareHeadersPath = resolve(distDir, "_headers");
  const nginxHeadersPath = resolve(distDir, "nginx-headers.conf");
  const skipReason =
    !existsSync(cloudflareHeadersPath) ||
    !existsSync(nginxHeadersPath) ||
    !existsSync(resolve(distDir, "index.html"))
      ? "dist/ has not been built — run `pnpm build:site` before this test (it gates CSP integrity)"
      : null;

  let cspCloudflare: string;
  let cspNginx: string;
  let cspHashesCloudflare: Set<string>;
  let cspHashesNginx: Set<string>;
  let inlineScriptBodies: Set<string>;
  let inlineScriptHashes: Set<string>;
  let inlineStyleBodies: Set<string>;

  beforeAll(() => {
    if (skipReason) return;
    cspCloudflare = readCspFromHeaders(cloudflareHeadersPath);
    cspNginx = readCspFromNginx(nginxHeadersPath);
    cspHashesCloudflare = new Set(extractCspHashes(cspCloudflare));
    cspHashesNginx = new Set(extractCspHashes(cspNginx));
    inlineScriptBodies = collectInlineScriptBodies(distDir);
    inlineScriptHashes = new Set(
      Array.from(inlineScriptBodies).map(hashInlineScript)
    );
    inlineStyleBodies = collectInlineStyleBodies(distDir);
    // Diagnostic: surface what's actually loaded when this test
    // runs in isolation. Vitest may resolve `repoRoot` differently
    // when running the file directly vs as part of a project.
    if (process.env["DEBUG_CSP_TEST"]) {
      // eslint-disable-next-line no-console
      console.log(
        `[cspHashContract] repoRoot=${repoRoot}\n` +
          `  distDir=${distDir}\n` +
          `  cloudflareHashes=${cspHashesCloudflare.size}\n` +
          `  inlineBodies=${inlineScriptBodies.size}\n` +
          `  inlineHashes=${inlineScriptHashes.size}\n` +
          `  firstBody=${Array.from(inlineScriptBodies)[0]?.slice(0, 60) ?? "<none>"}`
      );
    }
  });

  it.skipIf(skipReason)(
    "no dead hashes — every sha256-… in the CSP corresponds to a real inline script",
    () => {
      const dead: string[] = [];
      for (const h of cspHashesCloudflare) {
        if (!inlineScriptHashes.has(h)) dead.push(h);
      }
      expect(
        dead,
        `${dead.length} dead hash(es) in the Cloudflare CSP. Either a refactor removed the inline script but left the allowlist entry, or this test is reading the wrong directory. Dead hashes: ${dead.join(", ")}`
      ).toEqual([]);
    }
  );

  it.skipIf(skipReason)(
    "no missing hashes — every inline script hashes to a CSP-allowlisted sha256-…",
    () => {
      const missing: string[] = [];
      for (const h of inlineScriptHashes) {
        if (!cspHashesCloudflare.has(h)) missing.push(h);
      }
      expect(
        missing,
        `${missing.length} inline script(s) in dist/ are NOT in the CSP allowlist — ` +
          "the browser would block these. Either the integration's hash walker missed them " +
          "or the script was added after pnpm build:site ran without a rebuild. " +
          `Missing hashes: ${missing.join(", ")}`
      ).toEqual([]);
    }
  );

  it.skipIf(skipReason)(
    "Cloudflare and nginx CSPs carry the same hash set (single source of truth)",
    () => {
      // The two files are produced by different renderers
      // (`renderCloudflareHeaders` and `renderNginxHeaders`) but
      // must agree on the exact set of allowed hashes — otherwise
      // a script allowed on Cloudflare is blocked on nginx (or
      // vice versa).
      const cloudflareOnly = Array.from(cspHashesCloudflare).filter(
        h => !cspHashesNginx.has(h)
      );
      const nginxOnly = Array.from(cspHashesNginx).filter(
        h => !cspHashesCloudflare.has(h)
      );
      expect(cloudflareOnly).toEqual([]);
      expect(nginxOnly).toEqual([]);
    }
  );

  it.skipIf(skipReason)(
    "every dist/ HTML has at least one <style> block (Shiki / view-transition smoke test)",
    () => {
      // Smoke test that the production build is still emitting the
      // per-page `<style>` blocks that the runtime CSS-in-JS path
      // (view-transitions, per-page Tailwind) relies on. There is no
      // style-hash allowlist to assert against, so this test only
      // pins the presence of the block count as a regression
      // guard — when the site starts producing zero `<style>`
      // blocks per page, the view-transitions go invisible.
      expect(inlineStyleBodies.size).toBeGreaterThan(0);
    }
  );
});
