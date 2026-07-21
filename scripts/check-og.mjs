#!/usr/bin/env node
/**
 * `check-og.mjs` — post-build gate that asserts the rendered OG image
 * files in `dist/` are NOT the empty 1x1 transparent fallback emitted
 * by `src/utils/postOgImage.ts`'s `postOgImageFallback()`.
 *
 * Why this exists
 * ---------------
 * `dynamicOgImage` defaults to `true`. When a per-locale OG endpoint
 * throws (e.g. font bytes unavailable under Vite prerender chunking —
 * see issues.md T0-2), the endpoint catches the error and returns the
 * empty 1x1 PNG. Two failure modes used to ship silently:
 *
 *   1. **T0-1 (regressed)** — the per-locale endpoint at
 *      `src/pages/[locale]/posts/[...slug]/index.png.ts` lacked the
 *      `try/catch` the default-locale endpoint had. A regression
 *      there aborted the build before any image was rendered.
 *
 *   2. **T0-2 (regressed)** — `import.meta.url` font-path resolution
 *      broke under Vite's prerender chunk bundling. The default-locale
 *      endpoint silently caught the error and shipped the empty PNG.
 *
 * Both surfaced at build time only via `dist/og.png` being ~65 bytes
 * instead of the expected 50-100 KB. The vitest test for the TTF
 * bytes (T0-2) catches the upstream cause, but `check-og.mjs` is the
 * downstream guarantee: regardless of why, every PNG in `dist/` that
 * is supposed to render an OG image must be non-empty.
 *
 * Scope
 * -----
 * Walks `dist/` for:
 *
 *   - `dist/og.png`                          (site-level OG)
 *   - `dist/<locale>/og.png`                 (per-locale site OG)
 *   - `dist/posts/<slug>/index.png`          (per-post OG)
 *   - `dist/<locale>/posts/<slug>/index.png` (per-locale per-post OG)
 *
 * Astro deployments that set `base: "/blog"` (or similar) prepend
 * a leading segment to every route output, so the actual on-disk
 * shapes include `dist/blog/og.png`, `dist/blog/<locale>/og.png`,
 * `dist/blog/posts/<slug>/index.png`, and so on. The path
 * classifier below treats those as the same shape with an extra
 * leading segment rather than special-casing the base prefix.
 *
 * Skips `dist/_astro/*.png` (Astro's own bundled images — content
 * images embedded by posts, og-png assets inlined as content, etc.)
 * because those are NOT OG endpoints and aren't governed by
 * `postOgImageFallback`.
 *
 * Exit codes
 * ----------
 *   0 — every OG PNG is larger than the fallback threshold
 *   1 — at least one OG PNG matches the empty fallback, OR `dist/`
 *       exists but contains zero OG images (a build that produced
 *       the wrong files), OR a stat fails
 *   2 — operational failure (e.g. `dist/` does not exist)
 *
 * Threshold rationale
 * -------------------
 * The 1x1 transparent PNG fallback is a single IDAT chunk of
 * 6 filter-byte rows = the smallest legal PNG: ~65 bytes decoded
 * from `EMPTY_PNG_BASE64` in `src/utils/ogConstants.ts`. A real OG
 * image rendered by Satori (with the project title, author, and the
 * GoogleSansCode 400/700 TTFs) is always ≥25 KB — see the current
 * build: `dist/og.png`=59427 bytes, `dist/ru/.../index.png`=28873
 * bytes (smallest). 5 KB is ~80x above the fallback and ~5x below
 * the smallest real render. A 5 KB threshold catches regressions
 * without producing false positives on legitimate small renders.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_PNG_BASE64 } from "./ogConstants.mjs";

const EMPTY_PNG_BYTES = Buffer.from(EMPTY_PNG_BASE64, "base64");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DIST_DIR = join(REPO_ROOT, "dist");


const FALLBACK_BYTE_LEN = EMPTY_PNG_BYTES.length;

/**
 * A real OG image rendered by Satori is always ≥25 KB (smallest
 * actual render in the current build: 28873 bytes for
 * `dist/ru/posts/predefined-color-schemes/index.png`). 5 KB is
 * ~80x above the 65-byte fallback and ~5x below the smallest
 * real render, so 5 KB catches every regression variant
 * (silent fallback, post-build wipe, render truncation) without
 * producing false positives on legitimately small renders.
 */
const MIN_REAL_OG_BYTES = 5 * 1024;

/**
 * Decide whether a relative path under `dist/` should be checked.
 * Truthy when the path matches the OG-endpoint shapes enumerated
 * in the docstring above (with or without a leading `base` segment).
 *
 * Negative examples (skipped):
 *   - `dist/_astro/AstroPaper_-v7.BUxuIgJg.png` (inlined content image)
 *   - `dist/favicon.png` (public/ asset, not an OG endpoint)
 *   - `_astro/foo.png` (Astro's hashed asset dir, filtered above)
 *
 * Positive examples:
 *   - `og.png`
 *   - `ru/og.png`
 *   - `posts/predefined-color-schemes/index.png`
 *   - `ru/posts/predefined-color-schemes/index.png`
 *   - `blog/og.png`           (base-prefixed site OG)
 *   - `blog/ru/og.png`        (base-prefixed per-locale site OG)
 *   - `blog/ru/posts/<slug>/index.png` (base-prefixed per-locale per-post OG)
 */
function isOgEndpoint(relPath) {
  if (!relPath.endsWith(".png")) return false;
  // Normalise Windows backslashes that might sneak in from `path.relative`.
  // `filter(Boolean)` drops empty segments from a leading `dist/`
  // leftover (defensive; `path.relative` shouldn't emit them, but
  // belt + suspenders for the platform-portable case).
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  // Astro inlines content images under `dist/_astro/` (e.g.
  // `dist/_astro/AstroPaper_-v7.BUxuIgJg.png`). Those are NOT OG
  // endpoints and aren't governed by `postOgImageFallback`. Any
  // segment matching `_astro` disqualifies the path.
  if (parts.includes("_astro")) return false;
  const leaf = parts[parts.length - 1];
  // Site OG: leaf is `og.png` at ANY depth. Astro's output tree
  // guarantees no other subtree emits a file literally named
  // `og.png` — the `_astro/` filter above excludes the only
  // adjacent PNG-emitting tree (content-image hashes), and route
  // endpoints are the only output that lands at any depth with
  // that leaf name. With Astro's `base: "/blog"` (or similar) the
  // base prefix becomes one or more extra leading segments, so
  // `dist/blog/og.png`, `dist/blog/ru/og.png`, and deeper base
  // nestings all match this clause. (Previous version pinned
  // length to {1, 2} which rejected base-prefixed per-locale site
  // OGs — see P2 review.)
  if (leaf === "og.png") {
    return true;
  }
  // Per-post OG: a `posts` segment anywhere in the path AND the
  // leaf is `index.png`. The slug MAY contain internal `/`
  // characters (e.g. `dist/posts/examples/tailwind-typography/index.png`),
  // so we cannot tie the `posts` segment to a fixed index.
  // `parts.length >= 3` ensures at minimum
  // `posts/<slug>/index.png` — a single-segment `index.png` is not
  // a valid Astro endpoint shape, and the `_astro` filter above
  // blocks hashed content images like `dist/_astro/<hash>.png`.
  if (
    leaf === "index.png" &&
    parts.includes("posts") &&
    parts.length >= 3
  ) {
    return true;
  }
  return false;
}

function findOgPngs(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      let s;
      try {
        s = statSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(p);
      } else {
        const rel = relative(root, p);
        if (isOgEndpoint(rel)) {
          out.push({ abs: p, rel });
        }
      }
    }
  };
  walk(root);
  return out;
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.error(
      `[check-og] ${DIST_DIR} does not exist. Run \`pnpm build:site\` first.`
    );
    process.exit(2);
  }

  const ogPngs = findOgPngs(DIST_DIR);
  if (ogPngs.length === 0) {
    console.error(
      "[check-og] no OG PNG files found under dist/. The OG endpoints " +
        "did not render any images. Investigate the build output."
    );
    process.exit(1);
  }

  console.log(
    `[check-og] scanning ${ogPngs.length} OG PNG file(s) under dist/ ` +
      `(fallback=${FALLBACK_BYTE_LEN}B, min-real=${MIN_REAL_OG_BYTES}B)`
  );

  const failures = [];
  let totalBytes = 0;
  for (const { abs, rel } of ogPngs) {
    let stat;
    try {
      stat = statSync(abs);
    } catch (err) {
      failures.push(`${rel}: stat failed: ${err.message}`);
      continue;
    }
    const len = stat.size;
    totalBytes += len;
    if (len <= FALLBACK_BYTE_LEN) {
      failures.push(
        `${rel}: ${len}B — exactly the empty-fallback size; ` +
          `the OG endpoint returned the 1x1 PNG fallback (T0-1 / T0-2 regression).`
      );
      continue;
    }
    if (len < MIN_REAL_OG_BYTES) {
      failures.push(
        `${rel}: ${len}B — too small to be a real Satori render ` +
          `(min-real=${MIN_REAL_OG_BYTES}B). Almost certainly the empty ` +
          `fallback or a truncated render.`
      );
      continue;
    }
  }

  if (failures.length > 0) {
    console.error("");
    console.error(
      `[check-og] FAILED — ${failures.length} of ${ogPngs.length} ` +
        `OG PNG(s) are below the real-render threshold:`
    );
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    console.error("");
    console.error(
      "[check-og] Most likely causes: T0-1 (per-locale OG endpoint " +
        "missing try/catch) or T0-2 (font bytes unavailable, OG endpoint " +
        "silently ships the fallback). Re-run `pnpm build:site` after the " +
        "regression is fixed."
    );
    process.exit(1);
  }

  console.log(
    `[check-og] OK — ${ogPngs.length} OG PNG(s) all rendered ` +
      `(total ${(totalBytes / 1024).toFixed(1)} KiB, smallest ` +
      `>= ${MIN_REAL_OG_BYTES}B).`
  );
}

main();
