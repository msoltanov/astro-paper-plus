/**
 * `rehypeHeadingAnchors` — append a clickable `#` permalink to every body
 * heading at BUILD TIME so permalinks ship in the rendered HTML, instead
 * of being injected client-side by a `<script>` block on every post page.
 *
 * Why this exists
 * ---------------
 * Before this plugin, the per-post `<a href="#…">#</a>` permalink next
 * to every heading was injected by an inline `addHeadingLinks()` script
 * in `src/pages/posts/[...slug]/index.astro` (a screen-reader-consistent
 * `<span aria-hidden="true">#</span>` inside an anchor whose URL is
 * `#` + `heading.id`). Doing it at runtime meant:
 *
 * 1. **FOUC.** On first paint the heading appears alone, then the script
 *    runs and the `#` link fades in. Visible jank on slow connections.
 * 2. **JS-required.** No-JS readers, RSS-feed readers, and most reader-
 *    mode tools see plain headings — no permalink affordance at all.
 * 3. **Copy-link is broken pre-hydration.** The text `#` is rendered as
 *    a `<span>` until the script attaches the anchor; you can't
 *    right-click → "Copy link" until after the script has run.
 * 4. **View Transitions re-pay the cost.** With `astro:page-load` the
 *    script re-runs every navigation, doing AST-construction work the
 *    build could've done once and for all.
 * 5. **Inconsistency.** `src/pages/posts/[...slug]/index.astro` had the
 *    script; `src/pages/[locale]/posts/[...slug].astro` did not — so
 *    permalinks were present on the default-locale (en) route and
 *    silently missing on every other locale. Build-time emission
 *    closes that gap for free.
 *
 * Pipeline position
 * -----------------
 * `rehype-slug` runs FIRST in `src/remark-plugins.ts#rehypePre` so every
 * heading already carries a stable `id` by the time this plugin walks
 * the tree. `rehype-callouts` next, then this plugin — we still see
 * every body heading including any inside callout blocks, figure
 * captions, etc. (we don't wrap or move them, just append one anchor).
 *
 * If `rehype-slug` somehow failed to add an `id` (defence in depth —
 * shouldn't happen, but a malformed HTML attribute on `.mdx` could
 * confuse the slugger), this plugin derives a fallback slug from the
 * heading's plain text via `slugifyStr()` and applies it back to the
 * heading's `id` so the produced `<a href="#…">` still resolves to a
 * real DOM node instead of pointing at `#`.
 *
 * Why "append" not "wrap"
 * -----------------------
 * We append a single `<a>` to the heading's children rather than
 * wrapping the heading text in a clickable container. Reasons:
 *
 * - Match the runtime DOM exactly so existing CSS targeting
 *   `h2 > a.heading-link` continues to apply unchanged.
 * - Tailwind's `group` + `group-hover:` chain needs the *heading* to
 *   carry the literal class `group` (not the anchor). We add `group`
 *   to the heading itself.
 * - Anchoring the wrapper would steal clicks from the heading text
 *   itself and re-flow layout on hover. Appending keeps the heading
 *   readable as a heading; the `#` is a discovery affordance.
 *
 * Author escape hatches (in priority order)
 * -----------------------------------------
 * 1. `class="…no-heading-anchors…"` (any token in the class list) —
 *    leaves the heading untouched. Useful for inline `<h2>` inside
 *    callout-aside blocks where the `#` visual would be wrong.
 * 2. `data-no-heading-anchors="true"` (and `"…"` / bare form) — same
 *    opt-out, attribute form. HAST strips the `data-` prefix and
 *    camelCases kebab-case, so the attribute lives in
 *    `properties.dataNoHeadingAnchors`. We also accept the raw
 *    `data-no-heading-anchors` as a defensive fallback for hand-built
 *    ASTs (same convention `rehypeExternalLinks` / `rehypeLazyImages` /
 *    `rehypeFigureCaption` all use).
 * 3. Heading nested inside `<a>` or `<button>` — interactive parents
 *    must not contain another anchor child (HTML5 forbids `<a>` to
 *    nest; `<button>` containing `<a>` is invalid). Skipped silently.
 * 4. Heading that already carries an anchor with the `heading-link`
 *    class — idempotency for builds that invoke the plugin twice or
 *    hand-roll the anchor themselves.
 *
 * Configuration
 * -------------
 * Defaults mirror the runtime script's output exactly, so the visible
 * behaviour is unchanged for current posts. Override via the plugin
 * call site in `src/remark-plugins.ts` if you want different classes
 * (e.g. swap the hover effect for an always-on one).
 *
 * Scope
 * -----
 * Only headings inside markdown / MDX bodies are processed. Headings in
 * `.astro` layouts (e.g. `<h1>{title}</h1>` in the post page) are NOT
 * touched — they're written by hand and don't pass through the rehype
 * pipeline at all.
 */
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Element, ElementContent, Properties } from "hast";
import { slugifyStr } from "./slugify";
import { isTruthyAttr } from "./isTruthyAttr";

export interface RehypeHeadingAnchorsOptions {
  /**
   * Heading tags to add anchors to. Defaults to body headings only
   * (`h2`–`h6`). `h1` is intentionally excluded — every page in this
   * theme renders its post title as an `<h1>` above the article body,
   * so anchoring it would put a `#` next to the page title (which
   * already has its own id derived from the title slug elsewhere).
   *
   * Authors who want `<h1>` anchors can override this option. Note
   * the rest of the design assumes h2-h6 are body sections and h1 is
   * the title; changing this default changes that contract.
   */
  include?: string[];

  /**
   * If `false`, the plugin is a no-op. Useful for test fixtures that
   * want to pin behaviour against the bare pipeline (mirrors the
   * `{ enabled: false }` switch in `rehypeFigureCaption` /
   * `rehypeLazyImages`). Default: `true`.
   */
  enabled?: boolean;

  /**
   * Class string applied to the produced `<a>`. Defaults to the exact
   * class string the runtime `addHeadingLinks()` script produced, so
   * existing CSS targeting `.heading-link` continues to apply
   * unchanged: hover/focus-reveal on `lg`, muted appearance on mobile.
   */
  anchorClassName?: string;

  /**
   * Accessible label announced by screen readers instead of the literal
   * `#` glyph (which screen readers would otherwise announce as "hash").
   * The visual `#` survives inside an `aria-hidden` `<span>` so sighted
   * readers still see the affordance.
   */
  ariaLabel?: string;
}

type HeadingProps = Properties;

/** Default selector: body headings only (`h2`–`h6`). See `include` docs. */
const DEFAULT_INCLUDE: ReadonlyArray<string> = ["h2", "h3", "h4", "h5", "h6"];

/** Default anchor class string — matches the runtime output exactly.
 * Tailwind tokens: visible on mobile (`opacity-75`), faded on `md+`
 * until the heading is hovered (`md:group-hover:opacity-100`) or
 * receives keyboard focus (`md:focus:opacity-100`). The parent
 * heading carries the literal class `group` so `group-hover:` resolves. */
const DEFAULT_ANCHOR_CLASS =
  "heading-link ms-2 no-underline opacity-75 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100";

/** Default `aria-label` spoken by assistive tech. "Permalink" is the
 * GitHub / MDN convention; "this heading" disambiguates from page-
 * level permalinks. */
const DEFAULT_ARIA_LABEL = "Permalink to this heading";

/** Read the `id` attribute as a normalised trimmed string. Returns
 * `""` for missing or non-string values (HAST typing allows a few
 * edge cases — string arrays from hand-built trees, `null` from a
 * `null`-typed property). Treats whitespace-only as empty. */
function readId(props: HeadingProps | undefined): string {
  if (!props) return "";
  const id = props.id;
  if (typeof id !== "string") return "";
  return id.trim();
}

/** Read an HTML `class` / `className` attribute as a normalised array
 * of tokens. HAST stores `class` as an array of strings per the HTML
 * spec (`hast-util-from-html` pipeline); hand-built ASTs sometimes pass
 * a plain space-separated string. Both forms are accepted. */
function readClassList(props: HeadingProps | undefined): string[] {
  if (!props) return [];
  const raw = props.className ?? props.class;
  if (typeof raw === "string") return raw.split(/\s+/).filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(c => typeof c === "string");
  return [];
}

/** True if the heading already carries the literal class `group` —
 * either from author frontmatter, an earlier plugin, or a previous
 * run of this one (idempotency). */
function hasGroupClass(props: HeadingProps | undefined): boolean {
  return readClassList(props).includes("group");
}

/** True if the heading already has an `<a class="heading-link …">`
 * child from a previous plugin run. We check the class rather than
 * just the tagName so headings with genuinely-nested links (e.g.
 * `## See [Foo](/foo)`) still get anchored. */
function hasOwnAnchorChild(node: Element): boolean {
  const children = node.children;
  if (!Array.isArray(children)) return false;
  for (const child of children) {
    if (!child || child.type !== "element") continue;
    const el = child as Element;
    if (el.tagName !== "a") continue;
    if (readClassList(el.properties as HeadingProps).includes("heading-link")) {
      return true;
    }
  }
  return false;
}

/** Decide whether this heading should be skipped. Centralised so the
 * visit callback stays readable and the rules are unit-testable in
 * isolation. */
function shouldSkip(
  node: Element,
  parent: Element | Root | undefined
): boolean {
  if (!parent) return true;

  // Refuse to nest anchors inside interactive parents. HTML5 forbids
  // `<a>` from containing `<a>`; `<button>` containing `<a>` is also
  // invalid and assistive tech announces it as gibberish.
  if (parent.type === "element") {
    if (parent.tagName === "a" || parent.tagName === "button") return true;
  }

  const props = node.properties as HeadingProps | undefined;

  // `data-no-heading-anchors="…"` hard opt-out. HAST strips the
  // `data-` prefix and camelCases the kebab-case form, so the attribute
  // lives in `properties.dataNoHeadingAnchors`; the raw kebab-case form
  // is accepted as a defensive fallback for hand-built ASTs. P2-22:
  // any HTML5-truthy value (`""`, `"true"`, `"1"`, `"yes"`, …) counts
  // as the opt-out — previously only `""` and `"true"` were honoured,
  // which silently ignored `data-no-heading-anchors="1"` and bare
  // boolean attributes.
  const opt = props?.dataNoHeadingAnchors ?? props?.["data-no-heading-anchors"];
  if (isTruthyAttr(opt)) return true;

  // `no-heading-anchors` class token opt-out.
  if (readClassList(props).includes("no-heading-anchors")) return true;

  // Idempotency: don't stack a second anchor on top of one we (or the
  // author) already added.
  if (hasOwnAnchorChild(node)) return true;

  return false;
}

/** Plain-text content of a heading, walked recursively. Used to derive
 * a fallback slug if `rehype-slug` somehow skipped the heading — keeps
 * a missing-id case from producing a broken `href="#"`. */
function headingPlainText(node: Element): string {
  const parts: string[] = [];
  const walk = (children: readonly ElementContent[]) => {
    for (const c of children) {
      if (c.type === "text") {
        parts.push(c.value);
      } else if (c.type === "element") {
        walk(c.children);
      }
    }
  };
  walk(node.children);
  return parts.join("").trim();
}

/** Build the anchor element appended to each eligible heading.
 * The inner `<span aria-hidden="true">#</span>` is wrapped so:
 * - sighted readers see the `#` glyph (the visual affordance)
 * - screen readers only hear the anchor's `aria-label`, not `#`
 *   (which would otherwise be announced as "hash") */
function buildAnchor(id: string, classes: string, ariaLabel: string): Element {
  return {
    type: "element",
    tagName: "a",
    properties: {
      className: classes.split(/\s+/).filter(Boolean),
      href: `#${id}`,
      ariaLabel,
    },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { ariaHidden: "true" },
        children: [{ type: "text", value: "#" }],
      },
    ],
  };
}

const rehypeHeadingAnchors: Plugin<[RehypeHeadingAnchorsOptions?], Root> = (
  options = {}
) => {
  const include = options.include ?? Array.from(DEFAULT_INCLUDE);
  const includeSet = new Set(include);
  const enabled = options.enabled ?? true;
  const anchorClass = options.anchorClassName ?? DEFAULT_ANCHOR_CLASS;
  const ariaLabel = options.ariaLabel ?? DEFAULT_ARIA_LABEL;

  return tree => {
    if (!enabled) return;
    visit(tree, "element", (node: Element, _index, parent) => {
      if (!includeSet.has(node.tagName)) return;
      if (shouldSkip(node, parent as Element | Root | undefined)) return;

      // Prefer the id produced by `rehype-slug`. If it's missing —
      // shouldn't happen with the standard pipeline, but a malformed
      // `<h2 id="">` on `.mdx` could confuse the slugger — derive a
      // fallback and write it back so the `href` resolves to a real
      // DOM node rather than pointing at `#`.
      let id = readId(node.properties as HeadingProps);
      if (!id) {
        const derived = slugifyStr(headingPlainText(node));
        id = derived || "_";
        const props = (node.properties ?? {}) as HeadingProps;
        props.id = id;
        node.properties = props;
      }

      // Add `group` once. Tailwind's `group` + `group-hover:` variant
      // requires the parent to carry the literal class — skipping this
      // breaks the hover-reveal behaviour. Idempotent.
      const props = node.properties as HeadingProps;
      if (!hasGroupClass(props)) {
        const cls = readClassList(props);
        cls.push("group");
        props.className = cls;
      }

      // Append the anchor at the end of the heading's children.
      const children = (node.children ?? []) as ElementContent[];
      children.push(buildAnchor(id, anchorClass, ariaLabel));
      node.children = children;
    });
  };
};

export default rehypeHeadingAnchors;
