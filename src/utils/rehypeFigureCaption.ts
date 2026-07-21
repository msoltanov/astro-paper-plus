/**
 * `rehypeFigureCaption` — promote a Markdown image title into a real `<figcaption>`.
 *
 * Why this exists
 * ---------------
 * Standard CommonMark image syntax — `![alt](src "title")` — supports a
 * `title` attribute that most static-site themes ignore: the browser renders
 * it as a hover tooltip, and that's it. But authors regularly *want* that
 * text under the image as a real, styled, accessible caption. The only ways
 * to get one today are (a) drop into MDX and hand-roll
 * `<figure><img><figcaption>` for every picture, or (b) write HTML directly
 * in `.md` and get the escaping wrong. Both are friction the post body
 * doesn't need.
 *
 * This plugin walks the HAST tree emitted by `remark-rehype` and, for any
 * `<img>` that has a non-empty `title` attribute, wraps it in
 * `<figure><img><figcaption>{title}</figcaption></figure>`. The `title`
 * attribute is stripped from the `<img>` after the figcaption is built —
 * the text now lives where it's actually visible, not buried in an
 * unknown-to-readers tooltip.
 *
 * Why "title → figcaption" and not "alt → figcaption"
 * ---------------------------------------------------
 * Alt text and captions serve different audiences:
 *
 * - `alt` is read by screen readers. The W3C alt-text decision tree asks
 *   you to keep it concise and content-describing, or empty if the image
 *   is purely decorative.
 * - `<figcaption>` is read by sighted users on the page. It can be
 *   longer, contextual, even repeat nearby prose.
 *
 * Auto-generating a figcaption from `alt` couples the two and forces
 * authors to write a11y-bad alt text (long sentences) just to get a
 * usable caption, *or* to deliberately write empty alts to escape the
 * plugin (which tanks a11y). Tying the plugin to the standard
 * Markdown `title` attribute keeps the two concerns independent and
 * makes the feature opt-in by construction: no `title`, no figcaption.
 *
 * Author escape hatches (in priority order)
 * -----------------------------------------
 * 1. `class="…no-caption…"` (any token in the class list) — leaves the
 *    image untouched. Useful when you want a `title` for the hover
 *    tooltip but no figcaption beneath the image.
 * 2. `data-no-caption="true"` — same opt-out, attribute form.
 * 3. Author already wrote a `<figure>` wrapper (`.mdx` authors who hand-
 *    rolled it). The plugin refuses to nest figures.
 * 4. Author wrapped the image in an `<a>` (`[![alt](src)](href)`). The
 *    plugin refuses to wrap a link in a figure — `<a>` cannot legally
 *    contain `<figure>` per the HTML spec (and `<figure>` containing
 *    `<a>` is the legal direction).
 *
 * The plugin runs on the HAST tree (not mdast) so it also catches raw
 * `<img title="…">` HTML that authors write directly inside `.mdx`. This
 * is intentional — we want one set of defaults for the whole post body.
 *
 * Scope notes
 * -----------
 * - We only act on `<img>` elements. SVGs, Astro `<Image>` components
 *   (which already emit their own optimized markup and don't reach this
 *   plugin because they're pre-rendered before the markdown pipeline
 *   runs), and images outside the markdown/MDX body are unaffected.
 * - We do not strip or rewrite *other* attributes — only `title` is
 *   moved from `<img>` to `<figcaption>`.
 * - We do not touch images that have no `title` at all. The 99% case
 *   for posts that don't need a caption works exactly like before.
 */
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Element, Properties, Text } from "hast";
import { isTruthyAttr } from "./isTruthyAttr";

/** The HTML attribute shape for the bits we touch on `<img>`.
 * Mirrors the relevant subset of hast's `Properties` — the rest is
 * permissive via the index signature so we can read data-* attrs
 * without TypeScript complaining. */
type ImgProps = Properties;
type AnchorProps = Properties;

export interface RehypeFigureCaptionOptions {
  /**
   * If false, the plugin is a no-op. Useful for test fixtures that
   * want to pin behaviour against the bare pipeline. Default: true.
   */
  enabled?: boolean;
}

/** Read the `title` attribute as a trimmed plain string. Returns "" for
 * missing, non-string, or whitespace-only values — those signal "no
 * caption wanted" and the plugin must skip the image. */
function getTitle(node: Element): string {
  const props = node.properties as ImgProps | undefined;
  const raw = props?.title;
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/** Read the `class` HTML attribute as a normalised space-separated
 * string. HAST stores `class` as an array of tokens (per the
 * `hast-util-from-html` / HTML spec); older mdast-derived trees and
 * some hand-built ASTs pass a plain string. We accept both. */
function getClassName(props: ImgProps | undefined): string {
  const raw = props?.className ?? props?.class;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw))
    return raw.filter(c => typeof c === "string").join(" ");
  return "";
}

/** Author-driven opt-out: `data-no-caption="…"` truthy attribute or
 * `no-caption` class token. The author wrote `title="…"` for the
 * hover tooltip only — neither a wrapping `<figure>` nor a
 * promotion-to-`aria-label` should fire, regardless of where the
 * `<img>` sits (top-level → figure-wrapped, or inside `<a>` →
 * aria-label promotion). The link-wrap branch bypasses
 * `shouldSkip()` (HTML5 forbids `<a>` to contain `<figure>` so
 * that branch doesn't wrap), so it has to consult this predicate
 * directly to honour the same opt-out. */
function hasNoCaptionOptOut(node: Element): boolean {
  const props = node.properties as ImgProps | undefined;
  const noCaption = props?.dataNoCaption ?? props?.["data-no-caption"];
  if (isTruthyAttr(noCaption)) return true;
  const cls = getClassName(props);
  if (cls.split(/\s+/).includes("no-caption")) return true;
  return false;
}

/** Decide whether this image should be skipped. Centralising the
 * predicate keeps the visit callback readable and makes the rules
 * trivially unit-testable in isolation. */
function shouldSkip(node: Element, parent: Element | Root): boolean {
  if (node.tagName !== "img") return true;

  // Root-level parents (a bare `<img>` on its own line in `.mdx`, after
  // HTML block-level parsing) have no `tagName`. The checks below are
  // element-scoped; tag-aware guards only apply when the parent is
  // itself an Element.
  if (parent.type === "element") {
    // Already inside a figure — author (or another plugin) wrapped it.
    // Never nest figures, never duplicate a figcaption.
    if (parent.tagName === "figure") return true;

    // `<a>` cannot legally contain `<figure>`. Skip the link-wrap case
    // (`[![alt](src)](href)`) rather than producing invalid HTML.
    if (parent.tagName === "a") return true;
  }

  return hasNoCaptionOptOut(node);
}

/** Decide whether the link already has an accessible name. Per
 * WAI-ARIA's accessible-name calculation (accname 1.2, step 2F:
 * https://www.w3.org/TR/accname-1.2/), an `<a>` is named by, in order:
 * `aria-labelledby`, `aria-label`, and then the accumulated text
 * alternatives of its descendants. For `<img>` descendants the text
 * alternative is the `alt` attribute — `<a><img alt="Chart"></a>` is
 * already named "Chart" by spec, and the bug case `<a><img alt="Chart"
 * title="Open full size"></a>` would otherwise see the img's title
 * promoted to `aria-label`, silently overwriting the alt with the
 * hover-tooltip text. When any of these resolve to a non-empty value
 * we must NOT clobber the author's name with the image's `title`. */
function linkHasAccessibleName(link: Element): boolean {
  const props = (link.properties ?? {}) as AnchorProps;
  const ariaLabel = props.ariaLabel;
  if (typeof ariaLabel === "string" && ariaLabel.trim().length > 0) return true;
  // rehype-parse stores `aria-labelledby` as `ariaLabelledBy` and, for
  // multi-id values (`aria-labelledby="cap fig"`), splits it on
  // whitespace into an array. Treat any non-empty string OR any
  // non-empty id list as a present accessible name.
  const labelledBy = props.ariaLabelledBy ?? props["aria-labelledby"];
  if (typeof labelledBy === "string" && labelledBy.trim().length > 0)
    return true;
  if (
    Array.isArray(labelledBy) &&
    labelledBy.some(id => typeof id === "string" && id.trim().length > 0)
  )
    return true;
  return subtreeHasTextEquivalent(link);
}

/** Recursively walk an element's descendants looking for any text
 * equivalent: a non-whitespace text node, an `<img alt>`, or a
 * subtree that itself contains one. Per accname 1.2 step 2F, the
 * "text alternative" of an element is the accumulated normalised
 * text of its descendants, so the recursion must include every
 * element wrapper (e.g. `<a><strong>Read more</strong><img></a>` —
 * the `<strong>` wraps the actual visible label "Read more", and
 * treating only direct text children would miss it). */
function subtreeHasTextEquivalent(node: Element): boolean {
  for (const child of node.children ?? []) {
    if (child.type === "text" && child.value.trim().length > 0) return true;
    if (child.type === "element" && child.tagName === "img") {
      const alt = (child.properties as ImgProps | undefined)?.alt;
      if (typeof alt === "string" && alt.trim().length > 0) return true;
    }
    if (child.type === "element" && subtreeHasTextEquivalent(child)) {
      return true;
    }
  }
  return false;
}

function stripTitle(node: Element): void {
  const props = (node.properties ?? {}) as ImgProps;
  delete props.title;
  node.properties = props;
}

function setAccessibleName(node: Element, name: string): void {
  const props = (node.properties ?? {}) as AnchorProps;
  props.ariaLabel = name;
  node.properties = props;
}

/** Build the replacement `<figure><img><figcaption>{title}</figcaption></figure>`
 * node. The `<img>` is reused (not cloned) — by the time we get here
 * every other rehype plugin has finished mutating it, and we own the
 * only remaining mutation (stripping `title`). */
function buildFigure(img: Element, title: string): Element {
  // Strip `title` from the img — the same string now lives in the
  // figcaption, where it's visible. Keeping both would render the
  // caption twice (once as caption, once as a hover tooltip).
  stripTitle(img);

  const captionText: Text = { type: "text", value: title };
  const figcaption: Element = {
    type: "element",
    tagName: "figcaption",
    properties: {},
    children: [captionText],
  };
  return {
    type: "element",
    tagName: "figure",
    properties: {},
    children: [img, figcaption],
  };
}

const rehypeFigureCaption: Plugin<[RehypeFigureCaptionOptions?], Root> = (
  options = {}
) => {
  const enabled = options.enabled ?? true;
  return tree => {
    if (!enabled) return;
    visit(tree, "element", (node: Element, index, parent) => {
      // Both Root and Element parents carry a `children` array (Root is
      // the tree itself in a `rehypeParse({fragment: true})` pipeline,
      // and a direct child of the root in `remark-rehype` output when an
      // image sits at top level — e.g. a bare `<img>` block in MDX).
      // Anything else (rootless tree wrappers, etc.) is non-mutating, skip.
      if (parent === null || parent === undefined) return;
      if (parent.type !== "element" && parent.type !== "root") return;
      if (typeof index !== "number") return;

      const parentNode = parent as Element | Root;

      // #7 A11Y — `<a><img title="…"></a>` cannot be wrapped in a
      // `<figure>` (HTML disallows block-level inside `<a>`), so the
      // title would otherwise survive only as a hover tooltip and
      // screen readers in many browser configurations don't
      // announce image titles. Promote the title to `aria-label`
      // on the parent `<a>` (which IS announced) and strip it
      // from the `<img>` so it isn't duplicated as a tooltip.
      //
      // ONLY promote when the link has no other accessible name —
      // otherwise we'd silently overwrite an explicit
      // `aria-label="Download"` or visible text like
      // `<a><img title="Screenshot">Read more</a>` and change
      // what screen readers announce (and break sighted users
      // who rely on the visible text). When the link already
      // has a name, leave the img's `title` as a hover tooltip
      // for sighted users — the accessible-name contract is
      // already satisfied by the link's own label/text.
      if (
        parent.type === "element" &&
        parent.tagName === "a" &&
        node.tagName === "img"
      ) {
        const title = getTitle(node);
        if (
          title &&
          !hasNoCaptionOptOut(node) &&
          !linkHasAccessibleName(parent)
        ) {
          setAccessibleName(parent, title);
          stripTitle(node);
        }
        return;
      }

      if (shouldSkip(node, parentNode)) return;

      const title = getTitle(node);
      if (!title) return;

      const figure = buildFigure(node, title);
      parentNode.children[index] = figure;
    });
  };
};

export default rehypeFigureCaption;
