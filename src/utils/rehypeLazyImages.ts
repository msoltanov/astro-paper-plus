/**
 * `rehypeLazyImages` — performance-first image defaults for the
 * markdown/MDX pipeline.
 *
 * Why this exists
 * ---------------
 * Astro does not set `loading="lazy"` on images by default (you get
 * `loading="eager"`, which is correct for above-the-fold content but
 * wasteful for everything else). Adding the attribute to every image by
 * hand in `![alt](src)` lines is unrealistic — and the *first* image of
 * every post is the LCP candidate, so naively lazy-loading it would tank
 * Largest Contentful Paint scores.
 *
 * This plugin walks the HAST (HTML AST) emitted by `remark-rehype` and
 * sets:
 *
 * - `loading="lazy"` + `decoding="async"` on every `<img>` element
 *   by default — these are the browser hints that defer off-screen
 *   images and prevent image decoding from blocking the main thread.
 * - `loading="eager"` + `fetchpriority="high"` on the *first* `<img>`
 *   encountered in the document — that's the LCP candidate; we want it
 *   preloaded with priority over later images.
 *
 * Author escape hatches (in priority order)
 * -----------------------------------------
 * 1. `class="…no-lazy…"` (any token in the class list) — leaves the
 *    image untouched. Useful for `.mdx` authors who already know they
 *    want eager loading on a specific image.
 * 2. An explicit `loading="eager"` or `loading="lazy"` attribute — we
 *    respect it. (Same goes for an explicit `fetchpriority`.)
 * 3. `data-lcp="true"` — opts the image *into* the LCP treatment
 *    regardless of its position in the document. Useful when the
 *    actual LCP is the second image (e.g. an inline hero illustration
 *    after a small badge).
 *
 * The plugin runs on the HAST tree (not mdast) so it also catches raw
 * `<img>` HTML that authors write directly inside `.mdx` (markdown
 * `![]()` produces a normal `<img>` via `remark-rehype`, but raw HTML
 * survives the same path). This is intentional — we want one set of
 * defaults for the whole post body.
 *
 * Scope notes
 * -----------
 * - We do not touch SVGs (`<svg>`), Astro `<Image>` components (which
 *   already emit their own width/height/srcset and don't reach this
 *   plugin because they're pre-rendered before the markdown pipeline
 *   runs), or images outside the markdown/MDX body. Component-level
 *   `<img>` tags in `.astro` files are handled separately, in their
 *   own files.
 * - We do not strip author-provided attributes — we only add or
 *   override `loading`, `decoding`, and `fetchpriority`.
 */
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Element, Properties } from "hast";
import { isTruthyAttr } from "./isTruthyAttr";

/** The HTML attribute shape for the bits we touch on `<img>`.
 * Mirrors the relevant subset of hast's `Properties` — the rest is
 * permissive via the index signature so we can read data-* attrs
 * without TypeScript complaining. */
type ImgProps = Properties;

export interface RehypeLazyImagesOptions {
  /**
   * If false, never give the first image the LCP escape hatch (always
   * treat it like every other image). Useful in test fixtures that
   * want a single code path. Default: true.
   */
  protectFirstImage?: boolean;
}

/** Read the `class` HTML attribute as a normalised space-separated
 * string. HAST stores `class` as an array of tokens (per the
 * `hast-util-from-html` / HTML spec); older mdast-derived trees and
 * some hand-built ASTs pass a plain string. We accept both. */
function getClassName(props: ImgProps): string {
  const raw = props.className ?? props.class;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw))
    return raw.filter(c => typeof c === "string").join(" ");
  return "";
}

/** Decide whether this image should be skipped entirely. */
function shouldSkip(node: Element, props: ImgProps): boolean {
  if (node.tagName !== "img") return true;
  // `data-no-lazy="…"` is a hard opt-out. The `rehype-parse` /
  // `hast-util-from-html` pipeline strips the `data-` prefix and
  // camelCases kebab-case, so the attribute lives in `properties.dataNoLazy`.
  // We also accept the raw form (`props["data-no-lazy"]`) as a defensive
  // fallback for ASTs built by hand. P2-22: HTML5-truthy check
  // (`isTruthyAttr`) so `data-no-lazy="1"` / `data-no-lazy` (bare)
  // are also honoured — the old `=== "true"` only matched one
  // literal value and silently ignored every other form.
  const noLazy = props.dataNoLazy ?? props["data-no-lazy"];
  if (isTruthyAttr(noLazy)) return true;
  // `no-lazy` class token also opts out. HAST stores class as an array.
  const cls = getClassName(props);
  if (cls.split(/\s+/).includes("no-lazy")) return true;
  return false;
}

/** Apply the LCP escape hatch: eager + high priority, async decoding
 * (sync would actually slow first paint — browsers normally pick async
 * automatically when `loading="eager"`, so we leave `decoding` alone). */
function applyLcp(node: Element): void {
  const props = (node.properties ?? {}) as ImgProps;
  props.loading = "eager";
  props.fetchpriority = "high";
  node.properties = props;
}

/** Apply the default: lazy + async decode. We do not set
 * `fetchpriority` — `"auto"` is the browser default and adding it
 * explicitly is just noise. */
function applyLazy(node: Element): void {
  const props = (node.properties ?? {}) as ImgProps;
  props.loading = "lazy";
  props.decoding = "async";
  node.properties = props;
}

const rehypeLazyImages: Plugin<[RehypeLazyImagesOptions?], Root> = (
  options = {}
) => {
  const protectFirstImage = options.protectFirstImage ?? true;
  return tree => {
    // L3 (issues.md): the previous `firstSeen` name was module-
    // ambiguous; readers assumed module-scope state. The actual
    // lifetime is per-tree (this closure re-runs for every markdown
    // file) — the renamed `firstSeenInTree` makes that explicit.
    let firstSeenInTree = false;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const props = (node.properties ?? {}) as ImgProps;

      if (shouldSkip(node, props)) return;

      // Author explicitly opted in to LCP via `data-lcp="…"` (or any
      // HTML5-truthy value per P2-22). Wins over position-based
      // detection. HAST strips the `data-` prefix and converts
      // kebab-case to camelCase, so it lives in `properties.dataLcp`.
      // We also accept the raw form as a fallback.
      const isExplicitLcp = isTruthyAttr(props.dataLcp ?? props["data-lcp"]);
      if (isExplicitLcp) {
        applyLcp(node);
        // Mark so a later pass doesn't downgrade it.
        firstSeenInTree = true;
        return;
      }

      // Author explicitly set loading — respect it. (We still apply
      // decoding="async" because it's universally safe and rarely
      // overridden by authors.)
      if (
        typeof props.loading === "string" &&
        (props.loading === "eager" || props.loading === "lazy")
      ) {
        if (props.loading === "eager") {
          // Also propagate fetchpriority if author set one; otherwise
          // leave it untouched.
          firstSeenInTree = true;
        }
        props.decoding = props.decoding ?? "async";
        node.properties = props;
        return;
      }

      // Author set fetchpriority but not loading. P1-20: treat an
      // explicit `fetchpriority="high"` as an LCP opt-in (same
      // treatment as `data-lcp="true"` upstream) — setting
      // `loading="lazy"` on an image the author flagged as
      // high-priority defeats the intent, since browsers ignore
      // `fetchpriority` on lazy images. A `fetchpriority="low"` /
      // `"auto"` value still gets the lazy default; the special
      // case only applies to `"high"`.
      if (typeof props.fetchpriority === "string") {
        if (props.fetchpriority === "high") {
          applyLcp(node);
          firstSeenInTree = true;
          return;
        }
        applyLazy(node);
        return;
      }

      // First image in document → LCP candidate.
      if (protectFirstImage && !firstSeenInTree) {
        applyLcp(node);
        firstSeenInTree = true;
        return;
      }

      applyLazy(node);
    });
  };
};

export default rehypeLazyImages;
