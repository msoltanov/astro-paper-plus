/**
 * Constants for the dynamic Open Graph image pipeline (`satori` +
 * `sharp`). Centralised so the site-level endpoint and the per-post
 * endpoint can't drift out of sync.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// P3-...: paths are anchored to THIS module file (via `import.meta.url`)
/** rather than `process.cwd()` so the OG render-input set stays
 *  correct no matter where the build was launched from. The previous
 *  `__dirname` + relative `..` chain silently broke if a contributor
 *  moved `ogConstants.ts` into a subdirectory. */
const here = fileURLToPath(import.meta.url);

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_FONT_REGULAR = 400;
export const OG_FONT_BOLD = 700;

/**
 * Helper: file-system path to a sibling asset, anchored to this
 * module via `import.meta.url` rather than `process.cwd()`. Lets us
 * resolve both same-directory files (e.g. `postOgImage.ts`) and
 * `../assets/fonts/*.ttf` with one helper.
 */
function siblingAsset(relPath: string): string {
  return fileURLToPath(new URL(relPath, import.meta.url));
}

/**
 * Source files whose bytes determine the rendered PNG output. When
 * any of these change, the OG image bytes change, and the URL needs
 * to change too (otherwise caches serve the new image at the old
 * URL). The list is intentionally narrow: Satori layout + the two
 * vendored TTF fonts are the only inputs whose change isn't already
 * captured by `ogInputsHash` (which mixes the per-post title /
 * author / site title). Bundled JS, layout CSS, etc. don't render
 * into the PNG.
 *
 * Note: the rendered PNG actually consumes the TTF *bytes* embedded
 * inside `src/utils/fontBytes.generated.ts` (regenerated from the
 * vendored `.ttf` files at sync time via
 * `scripts/generate-font-bytes.mjs` — see T0-2). The vendored TTFs
 * are kept here as inputs because they're still the source of truth;
 * any change to the bytes invalidates BOTH the vendored file AND the
 * generated module, and hashing the vendored file catches that
 * two-step change at the source.
 */
const OG_RENDER_INPUTS = [
  here,
  siblingAsset("./postOgImage.ts"),
  siblingAsset("./fontBytes.generated.ts"),
  siblingAsset("../assets/fonts/GoogleSansCode-400-normal.ttf"),
  siblingAsset("../assets/fonts/GoogleSansCode-700-normal.ttf"),
] as const;

/**
 * Compute a deterministic-but-content-addressed version token from
 * the OG render inputs. Used as the fallback when git is unavailable
 * (Docker builds, tarball-extracted CI caches, fresh-clone CI without
 * tags). A 12-char hex prefix is plenty for cache-busting — the only
 * failure mode is "two unrelated render-affecting changes happen to
 * land in the same 4 billion-value space, on the same day" which is
 * astronomically below the noise floor of OG cache invalidation.
 */
function hashRenderInputs(): string {
  const hash = createHash("sha256");
  for (const path of OG_RENDER_INPUTS) {
    if (!existsSync(path)) continue;
    // The path itself goes into the hash first so renames (or
    // reordering of the inputs array) are also version-bumping
    // events. A future contributor who adds a new render-affecting
    // file but forgets to extend `OG_RENDER_INPUTS` won't see a
    // version bump on that change — pick it up in code review.
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/**
 * Bumped when the OG render pipeline changes shape in any way that
 * doesn't already get captured by the input hash (font pack changes,
 * Satori layout changes, color tweaks). On every rebuild after a bump
 * the per-post OG URL changes, so downstream caches re-fetch. Combined
 * with `ogInputsHash()` this gives a URL that is unique per content
 * AND per render version, so a stale cached image never surfaces a
 * new title.
 *
 * L — version bump convention:
 *
 *   - Git-aware builds use the Git short-SHA of the last commit
 *     (the strongest available signal: every render-affecting change
 *     gets a new commit, and the SHA is reproducible from
 *     `.git/HEAD`).
 *   - Git-less builds (Docker, where `.dockerignore` excludes
 *     `.git/`, OR fresh-clone CI without the repo's history) fall
 *     back to a content-hash of the OG render inputs (this file,
 *     `postOgImage.ts`, and the two vendored TTFs). The hash
 *     changes iff the render output can change, so a non-git build
 *     still invalidates caches exactly when a non-git build
 *     actually renders new pixels.
 *   - `process.env.OG_RENDER_VERSION` overrides either path —
 *     useful for CI that wants a single deploy-wide token (e.g.
 *     the upstream git SHA computed by the CI runner) regardless
 *     of whether `.git/` is in the build context.
 *   - The OG-input-hash test (`ogInputsHash.test.ts`) pins that
 *     the version is included in `ogInputsHash` so a future
 *     contributor who drops the version constant catches the
 *     regression.
 *   - When bumping, copy the previous value to
 *     `OG_RENDER_VERSION.previous` (in this same file) so
 *     `git log -p OG_RENDER_VERSION` shows the audit trail; the
 *     `previous` field is only referenced from this comment.
 */
function resolveOgRenderVersion(): string {
  const configured = process.env.OG_RENDER_VERSION?.trim();
  if (configured) return configured;
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (commit) return commit;
  } catch {
    // fall through to the content-hash fallback (Docker, tarball
    // CI caches, etc.). NOT a fallback to a fixed literal — that
    // would defeat the cache-bust contract on every non-git build.
  }
  try {
    return `src-${hashRenderInputs()}`;
  } catch {
    // If the hash fails (a vendored font is unreadable, a path is
    // unresolvable, etc.), keep the build alive with a constant
    // fallback token. A constant (not `Date.now()`) is the right
    // choice because:
    //   - The token survives across builds so downstream caches
    //     keep holding whatever they already had (no full CDN bust
    //     per non-git CI run).
    //   - The PNG render itself will fail later via the Satori
    //     path, surfacing a louder error than a quiet URL drift
    //     would.
    //   - A unique-per-build token would defeat the cache-bust
    //     contract on every non-git deploy (T2-1 in issues.md).
    return "src-fallback";
  }
}

export const OG_RENDER_VERSION = resolveOgRenderVersion();
// L — bump audit: when changing OG_RENDER_VERSION, append the old
// value here so the diff is human-readable. Sample shape:
//   //   "1" → "abc1234" (font pack swap)
//   //   "abc1234" → "def5678" (Satori layout tweak)

/**
 * Stable, short (8-char) content hash of the inputs that influence the
 * dynamic OG image. Used as the `?v=<hash>` query token on the
 * generated `og:image` URL so that an updated post (new title / author
 * / pub date) produces a different URL and busts every CDN + browser
 * cache that previously held the old image.
 *
 * Re-renders on rebuild happen any time input fields change. Without
 * a content hash, the per-post OG image URL stays the same for every
 * revision of the post because the URL is derived purely from the
 * slug — until the next rebuild, browsers and crawlers keep serving
 * the old image even though `Cache-Control: immutable` is honest
 * within a single build artifact, it wasn't safe across rebuilds.
 *
 * The hash is intentionally short (8 hex chars) so it stays readable
 * in OG-debugger UI while still being collision-free across the
 * realistic post count (40+ posts). Switch to 16 chars if collisions
 * are ever observed.
 */
export function ogInputsHash(parts: {
  title: string;
  author: string;
  siteTitle: string;
}): string {
  const norm = (s: string) => s.normalize("NFC").trim();
  const stableString = [
    OG_RENDER_VERSION,
    norm(parts.siteTitle),
    norm(parts.author),
    norm(parts.title),
  ].join("\u241F");
  return createHash("sha256").update(stableString).digest("hex").slice(0, 8);
}

/**
 * Cache directive for the public OG PNG responses.
 *
 * Without `immutable`: the URL is content-addressed via `?v=<hash>`
 * (see `ogInputsHash`) so a content change already moves the URL —
 * `immutable` would over-promise and tell intermediaries to never
 * revalidate even when the URL itself changes, which is misleading.
 * `max-age=86400` (24 h) gives a long enough window that repeat
 * crawlers amortise the cost of re-rendering the SVG, but short
 * enough that even a stale URL doesn't survive past one rebuild cycle
 * in practice.
 */
export const OG_CACHE_CONTROL = "public, max-age=86400";

/**
 * Cache directive for the fallback empty-PNG response (returned when
 * the OG render pipeline fails). We don't want to *cache* the failure
 * — a transient font fetch error on one deploy should not be served
 * after a fresh deploy succeeds.
 */
export const OG_FALLBACK_CACHE_CONTROL = "no-store";

/**
 * 1×1 transparent PNG. Used as a graceful fallback for OG endpoints
 * when the dynamic render pipeline can't produce a real image (missing
 * fonts, restricted CI env, satori/sharp error). Browsers treat this
 * as a valid image — readers see nothing instead of a broken-image
 * icon and crawlers see the bare <meta> defaults.
 */
export const EMPTY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
