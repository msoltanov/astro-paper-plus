/**
 * Cloudflare / nginx `_headers` integration.
 *
 * Extracted from `astro.config.ts` so the CSP-hash collection and the
 * `renderCloudflareHeaders` helper can be exercised directly from
 * vitest without booting a full Astro build. The split mirrors how
 * `src/integrations/sitemap.ts` is structured (factory at the top,
 * hooks below, helpers exported for tests).
 *
 * Behaviour contract:
 *   - Walk `dist/` for `.html` files.
 *   - For each, run the inline-script regex (anchored on the absence
 *     of `src=` immediately following `<script`).
 *   - Hash the inline script body with `sha256` and emit as
 *     `'sha256-<base64>'` strings, sorted + deduplicated.
 *   - Skip empty bodies, `application/ld+json`, `application/json`,
 *     and `importmap` blocks.
 *   - Substitute the placeholder in `_headers` and write to `dist/_headers`.
 *   - Parse the rendered CSP out of that file and emit the same value
 *     (plus non-CSP headers) as nginx `add_header` lines in
 *     `dist/nginx-headers.conf`.
 *
 * Anything that changes script bytes — the toolchain, a hook source,
 * a transformer's output — automatically yields a new hash list on
 * the next build; no manual upkeep.
 */
import type { AstroIntegration } from "astro";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

/**
 * Sentinel string the `dist/_headers` template carries on the
 * `Content-Security-Policy:` line, replaced at build time with the
 * computed inline-script hash list. The shape — leading +
 * trailing `__` plus `INJECTED_BY_BUILD` — is intentionally
 * distinct from any literal an editor might type, so a `grep`
 * for the placeholder string lands on both the const AND the
 * template occurrence in one hit.
 */
export const CSP_HASH_PLACEHOLDER = "__CSP_SCRIPT_HASHES_INJECTED_BY_BUILD__";

/**
 * Render the non-CSP headers as nginx `add_header` directives.
 * Mirrors `_headers` lines 1-8 (XCTO, XFO, Referrer-Policy,
 * Permissions-Policy, HSTS, COOP, CORP, COEP) and the shared
 * `add_header` `always` semantics from `nginx.conf`. The CSP itself
 * is handled separately so its long value stays readable.
 *
 * HSTS / COOP / CORP / COEP are defence-in-depth — Cloudflare
 * injects HSTS on the edge today, but the Docker / any-direct-nginx
 * deploy shouldn't drop it just because the host changes.
 *
 * COEP is `credentialless` (not `require-corp`) so the embed
 * iframes from `src/utils/remarkEmbeds.ts` (YouTube/Vimeo/Loom/
 * Bilibili/Twitch/SoundCloud/Spotify) continue to render in
 * COEP-isolated browsers without each upstream needing to send
 * `Cross-Origin-Resource-Policy: cross-origin`.
 */
export const NGINX_STATIC_HEADER_LINES: readonly string[] = [
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header X-Frame-Options "DENY" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), picture-in-picture=(self), fullscreen=(self), accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), clipboard-read=(), clipboard-write=(), display-capture=(), document-domain=(), gamepad=(), gyroscope=(), hid=(), idle-detection=(), local-fonts=(), magnetometer=(), midi=(), otp-credentials=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), speaker-selection=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()" always;',
  'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;',
  'add_header Cross-Origin-Opener-Policy "same-origin" always;',
  'add_header Cross-Origin-Resource-Policy "same-origin" always;',
  'add_header Cross-Origin-Embedder-Policy "credentialless" always;',
];

/**
 * Collect a de-duplicated, sorted list of CSP `'sha256-…'` source
 * expressions for every executable inline `<script>` in the built HTML.
 *
 * Astro inlines the small hoisted client scripts (theme, LocaleSwitcher,
 * back-to-top, view-transition focus, table-scroll, …) straight into each
 * page, so their bytes — and therefore their CSP hashes — shift whenever the
 * source or the toolchain changes. Hand-maintaining them in `_headers` drifts
 * and silently CSP-blocks the site's own scripts. Computing them from the
 * build output keeps `script-src` correct on every build with zero upkeep.
 *
 * Skipped: `src=` scripts (they load from `'self'`, no hash needed) and
 * `type="application/ld+json"` / `importmap` blocks (data, not executable —
 * CSP `script-src` doesn't gate them).
 *
 * Exported for direct testing under vitest; otherwise only called
 * internally by `cloudflareHeadersIntegration`.
 */
export function collectInlineScriptHashes(distDir: string): string[] {
  const htmlFiles: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      // R8: `Dirent.isDirectory()` reports the link type, not the
      // target — sibling walker to `walkFiles` in `sitemap.ts`;
      // `dist/` is build output and rarely symlinked, but the
      // pattern is consistent with the rest of the codebase.
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && p.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walk(distDir);

  const hashes = new Set<string>();
  // Inline `<script>` = one without a `src=` attribute. The negative
  // lookahead anchors at the start of the `<script` tag. The match
  // for `src=` requires it to be preceded by start-of-tag OR a
  // non-identifier character (NOT `-`). That's how we distinguish
  // `<script type="…" src="…">` (real `src=`) from
  // `<script data-src="…">` (NOT a real src). The naive forms both
  // miss the case:
  //   - `\bsrc=` treats `-` as a word boundary, so `data-src=` MATCHES
  //     and the script is wrongly classified as external.
  //   - `src\s*=` alone matches anywhere `src=` appears — same problem.
  // Either failure mode silently DROPS the inline script from the CSP
  // allowlist, which CSP-blocks the site's own JS the moment a
  // `data-src` attribute appears in any rendered HTML. The current
  // build has no script attributes starting with `data-`, so this is a
  // latent foot-gun — one commit away from a global CSP regression.
  const inlineScript =
    /<script(?![^>]*?(?:^|[^a-zA-Z0-9_-])src\s*=)([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = inlineScript.exec(html)) !== null) {
      const attrs = match[1] ?? "";
      const body = match[2];
      if (body.trim() === "") continue;
      if (
        /type=("|')?(application\/(ld\+json|json)|importmap)("|')?/i.test(attrs)
      ) {
        continue;
      }
      hashes.add(createHash("sha256").update(body, "utf8").digest("base64"));
    }
  }
  return [...hashes].sort().map(h => `'sha256-${h}'`);
}

/**
 * Substitute the CSP placeholder in `_headers` and return the rendered
 * contents + the parsed-out CSP value (used downstream to write the
 * nginx-format sibling file). Exported for direct testing.
 *
 * Throws if the placeholder is missing — the build should fail loud
 * rather than ship a `script-src` missing the inline-script hashes.
 *
 * Substitutes ONLY on the `Content-Security-Policy:` line, not the
 * whole file. A global `replaceAll` would silently rewrite the same
 * placeholder literal if it ever appeared inside an explanatory
 * comment block (as happened once during development), producing a
 * `dist/_headers` that "works" but embeds the hash list in a comment.
 * Scoping by line makes that impossible.
 */
export function renderCloudflareHeaders(
  template: string,
  hashes: string[]
): { rendered: string; cspValue: string } {
  if (!template.includes(CSP_HASH_PLACEHOLDER)) {
    throw new Error(
      `[cloudflare-headers] '${CSP_HASH_PLACEHOLDER}' not found in _headers — ` +
        "cannot inject inline-script CSP hashes."
    );
  }
  const hashesJoined = hashes.join(" ");

  // Per-line substitution, restricted to lines that look like the CSP
  // header line. The `[ \t]*` accepts the leading-indent Cloudflare uses
  // inside a path block.
  const lines = template.split("\n").map(line => {
    if (/^[ \t]*Content-Security-Policy:/.test(line)) {
      return line.replaceAll(CSP_HASH_PLACEHOLDER, hashesJoined);
    }
    return line;
  });
  const rendered = lines.join("\n");

  const cspMatch = rendered.match(/^[ \t]*Content-Security-Policy:\s*(.+)$/m);
  if (!cspMatch) {
    throw new Error(
      "[cloudflare-headers] could not parse CSP out of rendered _headers — " +
        "nginx-headers.conf not written."
    );
  }
  return { rendered, cspValue: cspMatch[1].trim() };
}

/**
 * Build the `nginx-headers.conf` body given a parsed CSP value.
 * Exported for direct testing. Trims surrounding whitespace so callers
 * that pass an already-formatted line (e.g. tests) still emit a
 * well-shaped `add_header` directive.
 */
export function renderNginxHeaders(cspValue: string): string {
  const csp = cspValue.trim();
  const lines: string[] = [
    "# Auto-generated by src/integrations/cloudflareHeaders.ts on every build.",
    "# DO NOT EDIT — edit _headers (the Cloudflare source of truth) instead.",
    "# This file mirrors the same CSP + static headers so nginx.conf can",
    "# `include /etc/nginx/nginx-headers.conf;` and ship strict CSP without",
    "# hand-maintained sha256- hashes that would drift on every script change.",
    "",
    ...NGINX_STATIC_HEADER_LINES,
    `add_header Content-Security-Policy "${csp}" always;`,
  ];
  return lines.join("\n") + "\n";
}

// Module-scoped state shared across the three hooks of a single
// build. Astro builds an integration object once and reuses it for
// every hook, so this is safe within a build process and isolated
// between builds (each pnpm build spawns a fresh Node process).
let cachedValidatedTemplate: string | null = null;
let projectRoot: string | null = null;
let exitFallbackInstalled = false;
let buildDoneFired = false;

/**
 * Install a `process.on('beforeExit')` listener that writes a
 * minimal CSP to `dist/_headers` + `dist/nginx-headers.conf` IF the
 * process exits without `astro:build:done` having fired. The
 * listener disarms itself on `astro:build:done` so a successful
 * build doesn't double-write.
 *
 * Caveats:
 *   - `beforeExit` does NOT fire on `process.exit()` from an
 *     uncaught exception in some Node versions. We add
 *     `uncaughtException` + `unhandledRejection` listeners too.
 *   - The listener writes to `<projectRoot>/dist/`. If `dist/`
 *     doesn't exist (build abort before Astro creates it), the
 *     write fails silently — that's acceptable: a missing dist is
 *     already a deploy-stop condition.
 */
function installExitFallback(): void {
  if (exitFallbackInstalled) return;
  exitFallbackInstalled = true;

  const fallback = () => {
    if (buildDoneFired) return;
    try {
      const root = projectRoot ?? process.cwd();
      const distRoot = join(root, "dist");
      if (!existsSync(distRoot)) return;
      const writeMinimal = (filename: string, body: string) => {
        try {
          writeFileSync(join(distRoot, filename), body);
        } catch {
          // best-effort; we don't want to mask the original error
        }
      };
      // Cloudflare `_headers` requires a path-pattern line followed by
      // indented `Header-Name: value` lines. A bare list of header
      // lines (without the `/*` path block) is silently ignored by
      // Cloudflare — exactly the failure mode this fallback is meant
      // to cover. Wrap the body in `/*\n  Header: value\n  ...` form
      // and translate nginx `add_header Name "value" always;` to
      // Cloudflare's unquoted `Name: value` shape. The `/*` path
      // applies the headers to every route in the deploy.
      const cloudflareBody =
        `# Auto-generated fail-safe by cloudflareHeadersIntegration.\n` +
        `# build:done never fired (build aborted). Cloudflare deploys\n` +
        `# get the strict CSP / nginx deploys get static headers below;\n` +
        `# inline scripts are NOT allowlisted because we don't know the\n` +
        `# final hashes. See issues.md T0-3.\n` +
        "/*\n" +
        NGINX_STATIC_HEADER_LINES.map(l => {
          // Single anchored match for the nginx shape so the
          // resulting `Header: value` has no leftover quotes or
          // `always;` directive. Multi-step `.replace` chains
          // earlier in this file's history left stray quotes
          // because the unwrap regex required the WHOLE remaining
          // string to be wrapped in quotes — a header line like
          // `add_header X-Frame-Options "DENY" always;` doesn't
          // match `^\s*"([^"]*)"\s*$` after stripping `add_header`,
          // so the value kept its quotes. The matched-group form
          // below handles all three parts (directive + name +
          // value) in one pass.
          const m = l.match(/^add_header\s+(\S+)\s+"([^"]*)"\s+always;\s*$/);
          return m ? `  ${m[1]}: ${m[2]}` : `  # (unparseable) ${l}`;
        }).join("\n") +
        "\n" +
        `  Content-Security-Policy: default-src 'self'\n`;
      writeMinimal("_headers", cloudflareBody);
      writeMinimal(
        "nginx-headers.conf",
        `# Auto-generated fail-safe by cloudflareHeadersIntegration — build aborted.\n` +
          NGINX_STATIC_HEADER_LINES.join("\n") +
          "\n" +
          `add_header Content-Security-Policy "default-src 'self'" always;\n`
      );
    } catch {
      // swallow — don't mask the original failure
    }
  };

  // Three listeners with distinct semantics:
  //
  // - `beforeExit`: Node's normal-exit hook. Fires when the event
  //   loop drains AND no error was thrown. Safe to write the
  //   fallback and let the process exit 0 — this path only triggers
  //   if `astro:build:done` was somehow skipped without an error
  //   (which shouldn't happen in normal builds but is the cheap
  //   safety net).
  // - `uncaughtException` / `unhandledRejection`: registering a
  //   handler REPLACES Node's default (print stack + exit 1). If
  //   the fallback handler returned without rethrowing, the process
  //   would exit 0 with a broken partial dist — exactly the failure
  //   mode this code is meant to prevent. Wrap with a small
  //   closure that writes the fallback AND re-throws so Node's
  //   default handler still runs after the degraded headers land on
  //   disk.
  process.on("beforeExit", fallback);
  process.on("uncaughtException", err => {
    fallback();
    throw err;
  });
  process.on("unhandledRejection", reason => {
    fallback();
    throw reason;
  });
}

function disarmExitFallback(): void {
  buildDoneFired = true;
}

/**
 * Astro integration that emits `dist/_headers` and `dist/nginx-headers.conf`.
 *
 * Hook layout (T0-3 issues.md):
 *   - `astro:config:done` — validate that the repo-root `_headers`
 *     source-of-truth exists and carries the inline-script
 *     placeholder. Throws loud if not — a missing source file is a
 *     deploy-wiring bug, not a build-time optimisation. Pinned
 *     BEFORE the build so a missing file surfaces at the build
 *     command's exit code (not after).
 *   - `astro:build:start` — install a `process.on('beforeExit')`
 *     fallback that writes a degraded CSP if the process exits
 *     without `astro:build:done` having fired. If the build aborts
 *     between `build:start` and `build:done` (prerender regression,
 *     network outage, …) Docker deploys still ship *some* CSP
 *     posture; Cloudflare deploys still ship *some* `_headers`.
 *     The strict hash-injected version overwrites these files on
 *     `astro:build:done`.
 *   - `astro:build:done` — walk `dist/` for inline `<script>` bodies,
 *     compute their sha256 hashes, render `_headers` with the
 *     placeholder substituted, write the nginx-format sibling. Resolves
 *     the `_headers` source via `import.meta.url` (relative to this
 *     module) so the integration works regardless of build cwd.
 *     (T2-7 — process.cwd() would break under monorepo builds.)
 *
 * Why three hooks instead of one:
 *   - The original implementation used `astro:build:done` only; a
 *     single prerender failure (T0-1) skipped the integration
 *     entirely, deploying naked `dist/` with no CSP. The fail-safe
 *     `build:start` + strict `build:done` split guarantees that
 *     ANY build outcome produces a non-empty header posture.
 */
export const cloudflareHeadersIntegration: AstroIntegration = {
  name: "cloudflare-headers",
  hooks: {
    "astro:config:done": async ({ config }) => {
      // Path anchored to this module via `import.meta.url` (T2-7).
      // A monorepo `pnpm --filter blog build` from a parent
      // directory has cwd ≠ repo root, so `resolve(process.cwd(),
      // "_headers")` would 404; the integration would fall through
      // and silently ship a CSP-less `dist/`.
      const source = fileURLToPath(new URL("../../_headers", import.meta.url));
      if (!existsSync(source)) {
        throw new Error(
          `[cloudflare-headers] _headers not found at ${source} — refusing to ` +
            `build without a CSP source of truth.`
        );
      }
      const template = readFileSync(source, "utf8");
      if (!template.includes(CSP_HASH_PLACEHOLDER)) {
        throw new Error(
          `[cloudflare-headers] _headers (${source}) is missing the script-hash ` +
            `placeholder '${CSP_HASH_PLACEHOLDER}' — content-security-policy would ` +
            `block the site's own JS. Restore the placeholder line in _headers.`
        );
      }
      // Cache the validated template so build:done doesn't re-read
      // it. Lives at module scope (one integration instance per
      // Astro build, never reconstructed mid-build).
      cachedValidatedTemplate = template;
      // `AstroConfig.root` is `URL | undefined` at this hook — the zod
      // schema (`core/config/schemas/base.js`) transforms the user
      // string into `new URL(val)` before the resolved config reaches
      // the integration. `fileURLToPath` converts that `file:` URL
      // into the platform-native path string the fallback expects
      // (`projectRoot` is consumed by `join(root, "dist")` in
      // `installExitFallback`'s fallback listener). Falls back to
      // `process.cwd()` only when Astro didn't pass a root at all
      // (rare — usually means `config:done` ran before `root` was
      // set).
      projectRoot = config.root ? fileURLToPath(config.root) : process.cwd();
    },

    "astro:build:start": async () => {
      // Fail-safe: install a process.on('exit') fallback listener
      // that writes degraded _headers + nginx-headers.conf IF the
      // build aborts between here and astro:build:done. The strict
      // version overwrites these files on build:done (and disarms
      // this listener via `disarmExitFallback`).
      //
      // The degraded CSP is `default-src 'self'` (no inline allowed)
      // — site hoisted scripts would fail this CSP, but the
      // alternative is shipping NO CSP at all, which is strictly
      // worse. Operators see the page break loudly at first paint
      // rather than silently fall through to a permissive default.
      installExitFallback();
    },

    "astro:build:done": async ({ dir }: { dir: URL }) => {
      const distDir = fileURLToPath(dir);
      const hashes = collectInlineScriptHashes(distDir);
      // T0-3 follow-up (defensive narrowing): `cachedValidatedTemplate`
      // is `string | null` because the `astro:config:done` hook that
      // populates it can early-return on validation failure. If a build
      // reached `astro:build:done` WITHOUT `config:done` having cached
      // the template, surface a loud error rather than calling
      // `renderCloudflareHeaders(null, hashes)` which the helper
      // rejects via `ts(2345)`. The validation hook throws on its
      // own failure path, so the `null` case is unreachable in normal
      // builds; the assertion just turns a silent runtime exception
      // into a deterministic build-time error.
      if (cachedValidatedTemplate === null) {
        throw new Error(
          "[cloudflareHeaders] astro:build:done fired before " +
            "astro:config:done populated cachedValidatedTemplate. " +
            "The _headers source file is missing or malformed."
        );
      }
      const { rendered, cspValue } = renderCloudflareHeaders(
        cachedValidatedTemplate,
        hashes
      );

      // 1) Cloudflare / Netlify format.
      const dest = fileURLToPath(new URL("_headers", dir));
      writeFileSync(dest, rendered);

      // 2) nginx format — Docker deploys.
      const nginxDest = fileURLToPath(new URL("nginx-headers.conf", dir));
      writeFileSync(nginxDest, renderNginxHeaders(cspValue));

      // Disarm the exit-time fallback ONLY after both writes have
      // landed on disk. If anything earlier in this hook throws
      // (hash collection, template rendering, or either
      // `writeFileSync`), the `uncaughtException` /
      // `unhandledRejection` handler installed in `astro:build:start`
      // sees `buildDoneFired === false` and writes the degraded
      // _headers + nginx-headers.conf fallback — preserving the
      // "ANY build outcome produces a non-empty header posture"
      // contract this integration is supposed to guarantee.
      // Disarming up-top (where it used to live) inverted that
      // guarantee: a final-hook failure exited with `buildDoneFired`
      // already true and the fallback listener skipping its write.
      disarmExitFallback();
    },
  },
};
