import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  collectInlineScriptHashes,
  renderCloudflareHeaders,
  renderNginxHeaders,
  NGINX_STATIC_HEADER_LINES,
  CSP_HASH_PLACEHOLDER,
} from "@/integrations/cloudflareHeaders";

/**
 * End-to-end tests for the CSP-hash pipeline that powers
 * `dist/_headers` and `dist/nginx-headers.conf`. Previously the entire
 * pipeline was inline in `astro.config.ts` and untested; a single regex
 * tweak or placeholder typo would silently ship a CSP that blocks the
 * site's own JS.
 *
 * The tests construct a tmpdir-shaped `dist/` and call the
 * integration's exported helpers directly (without booting Astro).
 */

const sha256Of = (body: string): string =>
  `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

describe("collectInlineScriptHashes", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "csp-test-"));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hashes a single inline script in a single HTML file", () => {
    const body = "console.log('hi');";
    writeFileSync(
      join(tmpDir, "index.html"),
      `<html><head><script>${body}</script></head></html>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of(body)]);
  });

  it("does NOT hash a script with a src= attribute", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<html><head><script src="/a.js"></script></head></html>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });

  it("does NOT classify data-src= as a real src= (regression: prior \\\\bsrc= bug)", () => {
    // The pre-fix regex `/\\bsrc=/` treated `-` as a word boundary, so
    // `<script data-src="foo.js">` was misclassified as an external
    // script and DROPPED from the CSP allowlist. That would have
    // CSP-blocked the site's own JS the moment a `data-src` attribute
    // appeared. With the post-fix regex, the inline body is hashed
    // because `src\\s*=` requires whitespace-preceded `src` — `data-src=`
    // doesn't match.
    writeFileSync(
      join(tmpDir, "index.html"),
      `<html><head><script data-src="unused.js">console.log('inline');</script></head></html>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of("console.log('inline');")]);
  });

  it("hashes the same body identically across files (de-duped, sorted)", () => {
    writeFileSync(join(tmpDir, "a.html"), `<script>x = 1;</script>`);
    writeFileSync(join(tmpDir, "b.html"), `<script>x = 1;</script>`);
    writeFileSync(join(tmpDir, "c.html"), `<script>y = 2;</script>`);
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of("x = 1;"), sha256Of("y = 2;")]);
  });

  it("skips type='application/ld+json' and 'importmap' blocks", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<script type="application/ld+json">{"@context":"https://schema.org"}</script>
       <script type="importmap">{"imports":{}}</script>
       <script>console.log('real');</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of("console.log('real');")]);
  });

  it("skips empty script bodies", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<script></script><script>  </script><script>real();</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of("real();")]);
  });

  it("walks nested directories for HTML files", () => {
    mkdirSync(join(tmpDir, "posts"));
    writeFileSync(join(tmpDir, "a.html"), `<script>root();</script>`);
    writeFileSync(
      join(tmpDir, "posts", "b.html"),
      `<script>nested();</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toHaveLength(2);
    expect(hashes).toContain(sha256Of("root();"));
    expect(hashes).toContain(sha256Of("nested();"));
  });

  it("returns an empty array for a directory without .html files", () => {
    writeFileSync(join(tmpDir, "style.css"), "/* css */");
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });

  // M — coverage for the latent regex foot-guns the collector was
  // designed around: data-* attributes that LOOK like src=, and
  // nonce= attribute combinations the original test sweep didn't
  // reach. These guard against a future Astro upgrade injecting a
  // new attribute prefix that breaks the negative-lookahead.
  it("M: <script nonce='…'> with a body still gets hashed", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<html><head><script nonce="abc123">console.log('nonce-script');</script></head></html>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of("console.log('nonce-script');")]);
  });

  it("M: mixed src= + data-src= on the same script tag drops only the external one", () => {
    // `<script src="/real.js" data-src="bogus.js">` is external (the
    // real `src` loads from 'self'); the `data-src` is a data
    // attribute that the negative-lookahead must NOT mis-anchor on.
    writeFileSync(
      join(tmpDir, "index.html"),
      `<html><head><script src="/real.js" data-src="bogus.js"></script></head></html>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });

  it("M: <script src='/x.js' async defer type='module'> still classified as external", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<html><head><script src="/x.js" async defer type="module"></script></head></html>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });

  it("M: <script type='application/json'> (NOT ld+json) is still skipped", () => {
    // Belt-and-braces: only `application/ld+json`, `application/json`,
    // and `importmap` are explicitly skipped. `application/json` is
    // unusual but the contract is "data, not executable", so it
    // belongs in the skip-list.
    writeFileSync(
      join(tmpDir, "index.html"),
      `<script type="application/json">{"k":"v"}</script>
       <script>real();</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([sha256Of("real();")]);
  });

  // M — combined-attribute regression guards for the classifier
  // (issues.md #2). The standalone cases above prove each attribute
  // is handled; these tests lock in the *combination* of attributes
  // a future Astro upgrade might emit, so any drift in the
  // negative-lookahead or the type-filter is caught at unit-test
  // time rather than by a CSP-blocked production build.
  it("M: <script type='importmap' nonce='…'> is skipped (type filter wins over body)", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<script type="importmap" nonce="abc123">{"imports":{}}</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });

  it("M: <script type='application/ld+json' nonce='…'> is skipped", () => {
    writeFileSync(
      join(tmpDir, "index.html"),
      `<script type="application/ld+json" nonce="abc123">{"@context":"https://schema.org"}</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });

  it("M: <script src='…' nonce='…' type='module'> stays external (src= wins)", () => {
    // Triple-attribute case: even with a nonce (which the build's
    // current scripts don't use, but a future Astro plugin might
    // emit), the negative-lookahead on `src=` still classifies this
    // as external — the body is loaded from a file, not inlined.
    writeFileSync(
      join(tmpDir, "index.html"),
      `<script src="/x.js" nonce="abc123" type="module">fallback();</script>`
    );
    const hashes = collectInlineScriptHashes(tmpDir);
    expect(hashes).toEqual([]);
  });
});

describe("renderCloudflareHeaders", () => {
  const TEMPLATE = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' ${CSP_HASH_PLACEHOLDER};

/*.png
  X-Content-Type-Options: nosniff
`;

  it("swaps the placeholder for the joined hash list and returns the rendered value", () => {
    const hashes = ["'sha256-aaa'", "'sha256-bbb'"];
    const { rendered, cspValue } = renderCloudflareHeaders(TEMPLATE, hashes);
    expect(rendered).toContain("script-src 'self' 'sha256-aaa' 'sha256-bbb';");
    expect(rendered).not.toContain(CSP_HASH_PLACEHOLDER);
    expect(cspValue).toContain("script-src 'self' 'sha256-aaa' 'sha256-bbb';");
  });

  it("swaps every occurrence on the CSP line", () => {
    // Two placeholders on the SAME CSP line — both get substituted
    // (replaceAll-style behaviour on the CSP line specifically).
    const template = TEMPLATE.replace(
      CSP_HASH_PLACEHOLDER,
      `${CSP_HASH_PLACEHOLDER} ${CSP_HASH_PLACEHOLDER}`
    );
    const { rendered, cspValue } = renderCloudflareHeaders(template, [
      "'sha256-only'",
    ]);
    expect(rendered).not.toContain(CSP_HASH_PLACEHOLDER);
    expect(rendered).toContain("'sha256-only' 'sha256-only'");
    expect(cspValue).toContain("'sha256-only' 'sha256-only'");
  });

  it("does NOT substitute placeholder text that appears in a # comment block", () => {
    // Regression guard for the case where a future editor describes
    // the placeholder token inside an explanatory `#` comment and
    // accidentally writes the literal — with the old per-file
    // `replaceAll` the literal in the comment got substituted with
    // the real hash list, producing a `dist/_headers` that
    // "works" but embeds the hashes in a comment. The fix scopes
    // the substitution to the `Content-Security-Policy:` line so
    // comments are left alone.
    const template = `/*
  # This text intentionally mentions the placeholder token
  # once more — must NOT be substituted: ${CSP_HASH_PLACEHOLDER}
  Content-Security-Policy: default-src 'self'; script-src 'self' ${CSP_HASH_PLACEHOLDER};
`;

    const { rendered, cspValue } = renderCloudflareHeaders(template, [
      "'sha256-real'",
    ]);
    // Comment line is preserved verbatim — placeholder literal stays.
    expect(rendered).toContain(
      `must NOT be substituted: ${CSP_HASH_PLACEHOLDER}`
    );
    // CSP line WAS substituted.
    expect(cspValue).toContain("script-src 'self' 'sha256-real';");
    expect(cspValue).not.toContain(CSP_HASH_PLACEHOLDER);
  });

  it("renders with an empty hash list when the site has no inline scripts", () => {
    const { rendered, cspValue } = renderCloudflareHeaders(TEMPLATE, []);
    expect(rendered).toContain("script-src 'self' ;");
    expect(cspValue).toContain("script-src 'self' ;");
  });

  it("throws when the placeholder is missing from the template", () => {
    const broken = `/*
  Content-Security-Policy: default-src 'self';
`;
    expect(() => renderCloudflareHeaders(broken, ["'sha256-x'"])).toThrow(
      /not found in _headers/
    );
  });

  it("throws when the template has no Content-Security-Policy line at all", () => {
    // Has the placeholder (so we get past the first check) but no CSP
    // line — exercises the "could not parse CSP" path specifically.
    const noCsp = `/*
  X-Frame-Options: DENY
  Script-Hash: ${CSP_HASH_PLACEHOLDER}
`;
    expect(() => renderCloudflareHeaders(noCsp, ["'sha256-x'"])).toThrow(
      /could not parse CSP/
    );
  });
});

describe("_headers placeholder documentation", () => {
  it("keeps the runtime token out of comment prose", () => {
    const template = readFileSync(
      join(import.meta.dirname, "..", "..", "_headers"),
      "utf8"
    );
    const comments = template
      .split(/\r?\n/)
      .filter(line => line.trimStart().startsWith("#"));
    expect(template).toContain("[CSP_HASH_PLACEHOLDER]");
    expect(comments.join("\n")).not.toContain(CSP_HASH_PLACEHOLDER);
  });
});

describe("_headers CSP policy", () => {
  const template = readFileSync(
    join(import.meta.dirname, "..", "..", "_headers"),
    "utf8"
  );

  it("pins form actions and keeps frame sources aligned with embed output", async () => {
    const { FRAME_SRC_ALLOWLIST } = await import("@/utils/remarkEmbeds");
    expect(template).toContain("form-action 'self'");
    for (const origin of FRAME_SRC_ALLOWLIST)
      expect(template).toContain(origin);
    expect(template).not.toContain("frame-src 'self' https://www.youtube.com ");
  });
});

describe("renderNginxHeaders", () => {
  it("includes every static header (XCTO, XFO, RP, PP, HSTS, COOP, CORP) and the CSP", () => {
    const out = renderNginxHeaders("script-src 'self' 'sha256-X';");
    // Spot-check each header family rather than matching the whole string,
    // so the test is resilient to comment / ordering tweaks.
    expect(out).toMatch(/add_header X-Content-Type-Options .*always;/);
    expect(out).toMatch(/add_header X-Frame-Options .*always;/);
    expect(out).toMatch(/add_header Referrer-Policy .*always;/);
    expect(out).toMatch(/add_header Permissions-Policy .*always;/);
    expect(out).toMatch(
      /add_header Strict-Transport-Security .*max-age=63072000.*always;/
    );
    expect(out).toMatch(/add_header Cross-Origin-Opener-Policy .*always;/);
    expect(out).toMatch(/add_header Cross-Origin-Resource-Policy .*always;/);
    expect(out).toContain(
      "add_header Content-Security-Policy \"script-src 'self' 'sha256-X';\" always;"
    );
  });

  it("preserves the same number of static headers as _headers (NGINX_STATIC_HEADER_LINES)", () => {
    // Belt-and-braces: if someone adds a header to `_headers` and forgets
    // to update `NGINX_STATIC_HEADER_LINES` (or vice versa), this guard
    // catches the drift.
    expect(NGINX_STATIC_HEADER_LINES.length).toBe(8);
  });

  it("emits only add_header directives with always semantics", () => {
    const out = renderNginxHeaders(
      "default-src 'self'; form-action 'self'; script-src 'self';"
    );
    const directives = out
      .split(/\r?\n/)
      .filter(line => line.startsWith("add_header "));
    expect(directives.length).toBeGreaterThan(0);
    expect(directives.every(line => /\salways;$/.test(line))).toBe(true);
    expect(out).toContain("Strict-Transport-Security");
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("form-action 'self'");
  });

  it("strips surrounding whitespace from the CSP value", () => {
    const out = renderNginxHeaders("  script-src 'self';  ");
    expect(out).toContain(
      "add_header Content-Security-Policy \"script-src 'self';\" always;"
    );
    expect(out).not.toMatch(/add_header Content-Security-Policy\s*"\s+/);
  });
});

/**
 * issues.md #27 reverse-direction guard.
 *
 * The forward direction ("given inline scripts in dist/, the right
 * hashes come out") is covered by `collectInlineScriptHashes` tests
 * above. This block pins the OTHER direction: every `'sha256-…'`
 * token shipped in `dist/_headers` and `dist/nginx-headers.conf`
 * must correspond to an actual inline `<script>` body in dist/, and
 * every inline script body must have its hash in both files.
 *
 * Without this guard, a future refactor could:
 *   - leave a hand-edited hash in the CSP allowlist that no script
 *     produces (dead hash → wasted bytes on every response, plus a
 *     misleading "this is the script hash" claim in the audit trail);
 *   - or render an inline script whose hash never reaches the CSP,
 *     which would make the script CSP-block the moment a strict CSP
 *     is enforced (the inline script would load but CSP would 403).
 *
 * Tests auto-skip when `dist/` is absent (e.g. running vitest in
 * isolation without a preceding `pnpm build`), consistent with the
 * other dist-reading tests.
 */
describe("issues.md #27 — built dist/ matches its declared CSP hash set", () => {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const distDir = join(projectRoot, "dist");
  const headersFile = join(distDir, "_headers");
  const nginxFile = join(distDir, "nginx-headers.conf");
  const skipReason = !existsSync(distDir)
    ? "dist/ has not been built — run `pnpm build:site` before this test (it gates CSP integrity)"
    : null;

  const extractDeclaredDirectiveHashes = (
    text: string,
    directive: "script-src" | "style-src"
  ): string[] => {
    const re = new RegExp(`${directive}[^;]*;`, "g");
    const matches = text.match(re) ?? [];
    return matches
      .flatMap(m => m.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [])
      .sort();
  };

  it.skipIf(skipReason)(
    "every inline `<script>` body in dist/ has its hash in both header files",
    { timeout: 30_000 },
    () => {
      const expectedScripts = [...collectInlineScriptHashes(distDir)].sort();
      const headersCf = readFileSync(headersFile, "utf8");
      const headersNginx = readFileSync(nginxFile, "utf8");
      const declaredCfScripts = extractDeclaredDirectiveHashes(
        headersCf,
        "script-src"
      );
      const declaredNginxScripts = extractDeclaredDirectiveHashes(
        headersNginx,
        "script-src"
      );

      expect(declaredCfScripts).toEqual(
        expect.arrayContaining(expectedScripts)
      );
      expect(declaredNginxScripts).toEqual(
        expect.arrayContaining(expectedScripts)
      );
    }
  );

  it("every `'sha256-…'` in the header files corresponds to an inline body in dist/ (catches dead hashes)", () => {
    if (!existsSync(distDir)) return;
    if (!existsSync(headersFile) || !existsSync(nginxFile)) return;

    const expectedScripts = new Set(collectInlineScriptHashes(distDir));
    const headersCf = readFileSync(headersFile, "utf8");
    const headersNginx = readFileSync(nginxFile, "utf8");
    const declaredCfScripts = extractDeclaredDirectiveHashes(
      headersCf,
      "script-src"
    );
    const declaredNginxScripts = extractDeclaredDirectiveHashes(
      headersNginx,
      "script-src"
    );

    const deadCfScripts = declaredCfScripts.filter(
      h => !expectedScripts.has(h)
    );
    const deadNginxScripts = declaredNginxScripts.filter(
      h => !expectedScripts.has(h)
    );

    expect(deadCfScripts).toEqual([]);
    expect(deadNginxScripts).toEqual([]);
  });

  it.skipIf(skipReason)(
    "dist/_headers and dist/nginx-headers.conf declare the same CSP hash set",
    { timeout: 30_000 },
    () => {
      const headersCf = readFileSync(headersFile, "utf8");
      const headersNginx = readFileSync(nginxFile, "utf8");
      expect(extractDeclaredDirectiveHashes(headersCf, "script-src")).toEqual(
        extractDeclaredDirectiveHashes(headersNginx, "script-src")
      );
    }
  );
});

/**
 * issues.md T3-4 — `_headers` (the Cloudflare source of truth) and
 * `NGINX_STATIC_HEADER_LINES` (the nginx mirror in
 * `src/integrations/cloudflareHeaders.ts:69-78`) must declare the
 * same non-CSP header set. Otherwise Docker deploys (nginx) and
 * Cloudflare deploys silently diverge on HSTS / XCTO / COOP / COEP
 * / etc. — a header is added/removed in one file but not the other.
 *
 * The forward parity check is structural: every nginx `add_header`
 * line translates to exactly one `Header-Name: value` line in the
 * root-level (non-path-scoped) block of `_headers`. The reverse
 * check confirms every "important" header in the root block has a
 * nginx counterpart — even headers that nginx can't express
 * exactly (e.g. COEP-credentialless is identical; CSP is generated
 * separately by `renderNginxHeaders`).
 *
 * Per-path blocks like `/*.png` carry Cloudflare-specific
 * augmentations (`X-Content-Type-Options: nosniff`) that nginx
 * cannot express the same way — those are intentionally skipped
 * from the reverse direction.
 */
describe("T3-4 — _headers ↔ NGINX_STATIC_HEADER_LINES non-CSP parity", () => {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const headersSourcePath = join(projectRoot, "_headers");
  const headersSource = readFileSync(headersSourcePath, "utf8");

  /**
   * Parse `add_header NAME "VALUE" always;` into a tuple. Drops
   * the nginx syntax sugar so we can compare it directly to a
   * `Name: value` Cloudflare line.
   */
  const parseNginxLine = (
    line: string
  ): { name: string; value: string } | null => {
    const m = line.match(/^add_header\s+([A-Za-z-]+)\s+"([^"]*)"\s+always;$/);
    return m ? { name: m[1], value: m[2] } : null;
  };

  /**
   * Walk the root-level (top-of-file) block of `_headers` until we
   * hit either:
   *   - the CSP line (a single `Content-Security-Policy:` line at
   *     the root), or
   *   - a per-path block opener (e.g. `/*.png`), or
   *   - end-of-file.
   * Yields only the `Name: value` lines so we can match them
   * against `NGINX_STATIC_HEADER_LINES` 1:1.
   */
  const rootHeaderPairs = (source: string): Map<string, string> => {
    const out = new Map<string, string>();
    for (const rawLine of source.split("\n")) {
      const line = rawLine.trim();
      if (line === "") continue;
      if (line.startsWith("#")) continue;
      if (/^[A-Za-z][A-Za-z-]*\s*:/.test(line) === false) continue;
      if (/^Content-Security-Policy\s*:/i.test(line)) break;
      if (/^\/[^/]*$/.test(line)) break;
      const colon = line.indexOf(":");
      const name = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (name && value) out.set(name, value);
    }
    return out;
  };

  it("_headers is readable from disk (catches an accidentally-deleted source-of-truth file)", () => {
    expect(headersSource.length).toBeGreaterThan(0);
  });

  it("every NGINX_STATIC_HEADER_LINES entry has a matching `Header-Name: value` line in the root block of _headers", () => {
    const pairs = rootHeaderPairs(headersSource);
    const missing: string[] = [];
    for (const line of NGINX_STATIC_HEADER_LINES) {
      const parsed = parseNginxLine(line);
      if (!parsed) {
        missing.push(`(unparseable nginx line: ${JSON.stringify(line)})`);
        continue;
      }
      if (pairs.get(parsed.name) !== parsed.value) {
        missing.push(
          `nginx says: ${line}\n` +
            `  expected in _headers root block: '${parsed.name}: ${parsed.value}'\n` +
            `  found in _headers root block:   ${JSON.stringify(pairs.get(parsed.name))}`
        );
      }
    }
    expect(missing).toEqual([]);
  });

  it("the root block of _headers does not silently grow a header that nginx lacks", () => {
    const pairs = rootHeaderPairs(headersSource);
    const nginxNames = new Set<string>();
    for (const line of NGINX_STATIC_HEADER_LINES) {
      const parsed = parseNginxLine(line);
      if (parsed) nginxNames.add(parsed.name);
    }
    const orphan = [...pairs.keys()].filter(n => !nginxNames.has(n));
    expect(orphan).toEqual([]);
  });

  it("NGINX_STATIC_HEADER_LINES count matches the root non-CSP count in _headers (catch-all on top-level drift)", () => {
    const pairs = rootHeaderPairs(headersSource);
    expect(NGINX_STATIC_HEADER_LINES.length).toBe(pairs.size);
  });
});
