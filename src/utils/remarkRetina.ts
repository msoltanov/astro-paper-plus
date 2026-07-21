/**
 * `remarkRetina` — detect "high-density" screenshots in markdown and emit them
 * at half their natural pixel dimensions.
 *
 * Why this exists
 * ---------------
 * On a Retina-class display, selecting a 200×200 region produces a 400×400 px
 * PNG file. Most browsers render that at 400 CSS px because they trust the
 * source pixel dimensions, not the author's intent. GitHub papers over this by
 * special-casing macOS screencapture filenames and halving the emitted
 * `width`/`height` while adding a `srcset` with both densities. Astro does not.
 *
 * This plugin reproduces that behavior for the AstroPaper+ (fork of AstroPaper+) markdown pipeline:
 *
 * 1. Find every `image` node whose `url` matches a configured "retina
 *    screenshot" filename pattern.
 * 2. Read the file's true dimensions with `sharp`.
 * 3. Attach `width` / `height` (halved) and `data-retina="halved"` to the
 *    node via mdast `hProperties`, so the downstream `remark-rehype`
 *    renders a real `<img>` element with our explicit width/height — which
 *    Astro's `astro:assets` then honours when generating the responsive
 *    `srcset`.
 *
 * Coupled with `image.layout: "constrained"` in `astro.config.ts`, the image
 * service produces a `srcset` whose breakpoints are expressed in CSS pixels
 * (640w, 828w, 1080w, …) sourced from the full-resolution file via Sharp
 * downscale — the same DPR semantics as a `densities={[1,2]}` srcset, but
 * without forcing authors to switch to MDX + `<Image>`.
 *
 * Limitations
 * -----------
 * - We only adjust `width`/`height` here. The Astro image service generates
 *   width-descriptor srcsets (not `1x`/`2x`). Width-based srcsets already
 *   adapt to `device-pixel-ratio` correctly (a 2× display at 800 CSS px picks
 *   the 1600w entry), so this is sufficient for our case.
 * - Files not present on disk are left untouched (defensive — we don't want
 *   a single broken path to fail the whole build).
 * - The default filename patterns target macOS screencaptures, Linux/Chrome
 *   screenshots, and the `@2x`/`_2x`/`-2x` conventions used by many design
 *   systems. Override via `options.patterns`.
 * - Markdown `![]()` image syntax requires URL-encoded paths for spaces, so
 *   `![shot](Screen Shot 2025-01-30.png)` will not even parse as an image.
 *   Authors hitting that need to either rename the file, reference it as
 *   `![shot](Screen%20Shot%202025-01-30.png)`, or use raw `<img>` HTML.
 */
import { visit } from "unist-util-visit";
import type { Image, Root } from "mdast";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

type ImageNode = Image;

// mdast `hProperties` — what `remark-rehype` applies to the resulting HAST
// element. Keys are HTML attribute names; values are JSON-serialisable
// strings/numbers/booleans. See: https://github.com/syntax-tree/mdast-util-to-hast#fields-on-nodes
type HProperties = Record<string, string | number | boolean | undefined>;

export type RemarkRetinaOptions = {
  /**
   * Regex array; an image url is treated as a high-density screenshot if any
   * pattern matches. Each pattern is tested against the *full url string*
   * (including any path prefix), so you can scope patterns to a directory if
   * needed (e.g. `/\/screenshots\//`).
   */
  patterns?: RegExp[];
  /**
   * If the image url is a URL or absolute path (`http(s):`, `data:`, starts
   * with `/`), we leave it alone. Override only if you have an unusual setup.
   */
  skipRemote?: boolean;
};

const DEFAULT_PATTERNS: RegExp[] = [
  // macOS screenshot default filename: "Screen Shot 2025-01-30 at 14.22.17.png"
  /^Screen[ _-]?Shot/i,
  // Linux/Chrome screenshot default filename: "Screenshot from 2025-01-30..." or "Screenshot_2025-..."
  /Screenshot[ _-]/i,
  // Convention used by many design systems: foo@2x.png, foo_2x.png, foo-2x.png
  /@2x\./i,
  /[_-]2x\./i,
];

const PATTERN_NAMES: Record<string, string> = {
  "/^Screen[ _-]?Shot/i": "macOS screencapture",
  "/Screenshot[ _-]/i": "Linux/Chrome screenshot",
  "/@2x\\./i": "@2x convention",
  "/[_-]2x\\./i": "_2x convention",
};

const PROBE_TIMEOUT_MS = 5000;

/**
 * Pool libvips concurrency + enable Sharp's internal cache so a build with
 * many retina screenshots doesn't serialise every `.metadata()` call onto
 * a single worker. Both options are process-global; the first call wins
 * so calling this from every `readDimensions` would be harmless but
 * wasteful. Centralised here and guarded.
 */
let sharpConfigured = false;
function configureSharp(): void {
  if (sharpConfigured) return;
  sharpConfigured = true;
  // Keep decoded pixel buffers between operations — metadata() already
  // touches the file header, so subsequent operations on the same path
  // skip the disk read.
  sharp.cache(true);
  // Allow libvips to use all cores; the default of 1 leaves multi-core
  // machines under-utilised on retina-heavy posts.
  sharp.concurrency(0);
}

/**
 * Decode the file's natural pixel dimensions with a timeout. Sharp's
 * `metadata()` is fast for already-decoded images but can be expensive for
 * very large PNGs; we cap the wait so a single broken asset doesn't stall a
 * 10k-page build.
 */
function readDimensions(
  absPath: string
): Promise<{ w: number; h: number } | null> {
  configureSharp();
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, PROBE_TIMEOUT_MS);
    sharp(absPath)
      .metadata()
      .then(meta => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (meta.width && meta.height) {
          resolve({ w: meta.width, h: meta.height });
        } else {
          resolve(null);
        }
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Find which filename convention matched the src, for the explanatory
 * `data-retina-reason` attribute we emit alongside `data-retina="halved"`.
 */
function matchReason(src: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    if (p.test(src)) {
      return PATTERN_NAMES[p.toString()] ?? p.toString();
    }
  }
  return null;
}

/**
 * Resolve an image src against the markdown file's directory. Handles:
 * - relative paths (`./foo.png`, `../foo.png`, `assets/foo.png`)
 * - the `@/` TS alias if its value matches `src/...` literal
 * - leaves everything else (URLs, absolute paths, `public/...`) untouched
 */
function resolveSrc(
  src: string,
  markdownDir: string | undefined,
  projectRoot: string
): string | null {
  if (!src) return null;
  if (/^[a-z]+:/i.test(src) || src.startsWith("data:") || src.startsWith("/")) {
    return null;
  }
  // `@/assets/images/AstroPaper+-v3.png` is the alias syntax used elsewhere in
  // this repo; resolve it against `projectRoot`.
  if (src.startsWith("@/")) {
    return path.resolve(projectRoot, "src", src.slice(2));
  }
  // Relative: anchored to the markdown file's directory, or project root.
  const base = markdownDir ?? projectRoot;
  return path.resolve(base, src);
}

export default function remarkRetina(options: RemarkRetinaOptions = {}) {
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const skipRemote = options.skipRemote ?? true;
  return async (tree: Root, file: { dirname?: string; cwd?: string } = {}) => {
    const markdownDir = file.dirname;
    const cwd = file.cwd ?? process.cwd();
    const pending: Promise<void>[] = [];
    visit(tree, "image", (node: ImageNode) => {
      const rawSrc = node.url;
      if (!rawSrc) return;
      if (
        skipRemote &&
        (/^[a-z]+:/i.test(rawSrc) || rawSrc.startsWith("data:"))
      ) {
        return;
      }
      // markdown image syntax URL-encodes the src (e.g. spaces become %20), so
      // we decode it for the patterns check and for filesystem access.
      // Pattern matching against the encoded form would miss plain filenames
      // with spaces; pattern matching against the decoded form catches them.
      let src: string;
      try {
        src = decodeURIComponent(rawSrc);
      } catch {
        src = rawSrc;
      }
      if (!patterns.some(p => p.test(src))) return;
      const abs = resolveSrc(src, markdownDir, cwd);
      if (!abs) return;
      // P1-19: contain the resolved path so `path.resolve(base,
      // "../../etc/passwd")` doesn't happily return files OUTSIDE
      // either trusted root. Two trust anchors cover all the paths
      // the plugin ever resolves:
      //   1. `cwd` — covers `@/<rest>` paths resolved against the
      //      repo root, and absolute / root-relative fallthroughs.
      //   2. `markdownDir` — covers relative `<rest>` paths that
      //      sit next to the markdown file. Authoring a post under
      //      `posts/foo/assets/img.png` is the most common shape;
      //      the plugin must NOT reject that as "outside cwd" just
      //      because tests put the markdown source in a tmpdir.
      // Without this guard an author-supplied / attacker-supplied
      // path probes the host filesystem with `sharp.metadata()` —
      // either slow the build to a halt or surface arbitrary
      // readable files via the absence of an error.
      const projectRootAbs = path.resolve(cwd);
      const markdownRootAbs = markdownDir ? path.resolve(markdownDir) : null;
      const inside = (root: string | null): boolean => {
        if (!root) return false;
        return abs === root || abs.startsWith(root + path.sep);
      };
      if (!inside(projectRootAbs) && !inside(markdownRootAbs)) {
        return;
      }
      pending.push(
        (async () => {
          try {
            await fs.access(abs);
          } catch {
            // File not on disk — leave the node alone; Astro will surface the
            // broken path through its own image processing.
            return;
          }
          const dims = await readDimensions(abs);
          if (!dims) return;
          const wHalf = Math.max(1, Math.round(dims.w / 2));
          const hHalf = Math.max(1, Math.round(dims.h / 2));
          const reason = matchReason(src, patterns);
          // Attach `hProperties` so `remark-rehype` renders the `<img>`
          // element with our explicit width/height (halved) and the
          // diagnostic data attributes. Astro's image service preserves
          // these through to the emitted HTML and uses the explicit
          // dimensions as the basis for responsive srcset breakpoints.
          node.data = node.data ?? {};
          const props =
            (node.data.hProperties as HProperties | undefined) ?? {};
          props.width = wHalf;
          props.height = hHalf;
          if (reason) props["data-retina-reason"] = reason;
          props["data-retina"] = "halved";
          node.data.hProperties = props;
        })()
      );
    });
    if (pending.length) await Promise.all(pending);
  };
}
