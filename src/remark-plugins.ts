/**
 * Shared remark/rehype plugins used by both:
 * - Astro's built-in Markdown processor (for `.md` posts)
 * - The `@astrojs/mdx` integration (for `.mdx` posts)
 *
 * Keep this list in one place so a fenced code block parses identically
 * in both pipelines — otherwise MDX-only / Markdown-only differences
 * sneak in unnoticed.
 *
 * NOTE: this file is also imported from `astro.config.ts`, which is loaded
 * via `jiti` (no TypeScript path alias resolution). Keep imports here as
 * RELATIVE paths so they load in both contexts.
 */
import type { Plugin } from "unified";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import rehypeSlug from "rehype-slug";
import remarkMermaid from "./utils/remarkMermaid";
import remarkRetina from "./utils/remarkRetina";
import remarkEmbeds from "./utils/remarkEmbeds";
import rehypeLazyImages from "./utils/rehypeLazyImages";
import rehypeFigureCaption from "./utils/rehypeFigureCaption";
import rehypeHeadingAnchors from "./utils/rehypeHeadingAnchors";
import rehypeExternalLinks from "./utils/rehypeExternalLinks";
import astroPaperConfig from "../astro-paper.config";
import enLang from "./i18n/lang/en";
import ruLang from "./i18n/lang/ru";
import trLang from "./i18n/lang/tr";

// Site origin used by `rehypeExternalLinks` to decide what's "off-site".
// Derived once at module load — `astro-paper.config.ts` is checked-in
// and the value is stable, so per-request recomputation would be waste.
// `new URL(...)` throws if the value is malformed; let it bubble at
// config-load time rather than silently rewriting every link on the site.
const SITE_ORIGIN = new URL(astroPaperConfig.site.url).origin;

/**
 * Per-locale `rehypeExternalLinks` translations. The plugin reads the
 * active locale from the VFile path (`rehypeExternalLinks` derives it
 * from `/posts/<locale>/` or `/pages/<locale>/`), then picks the
 * matching entry here. Falls back to the plugin's English default when
 * a locale is missing or the path can't be classified.
 *
 * `link.opensInNewTab` is the WCAG 3.2.5 "change on request"
 * announcement that screen readers append after the link text — it
 * belongs in the same language as the link itself so visitors who
 * navigate by sound hear the warning in their language.
 */
const EXTERNAL_LINK_TRANSLATIONS: Record<string, { opensInNewTab: string }> = {
  en: { opensInNewTab: enLang.link.opensInNewTab },
  ru: { opensInNewTab: ruLang.link.opensInNewTab },
  tr: { opensInNewTab: trLang.link.opensInNewTab },
};

// Mermaid first so its `code` nodes are replaced with raw HTML before
// the ToC walker or any later plugin sees them. Typed as
// `AstroPluggableList` (the narrower union defined at the bottom of
// this file) so the literal has to be member-by-member assignable to
// the processor's `remarkPlugins` slot — anything wider (e.g. an
// accidental `Preset` entry) fails the build.
const remarkPre: AstroPluggableList = [
  remarkMermaid,
  remarkToc,
  [remarkCollapse, { test: "Table of contents" }],
  // Bare-URL auto-embeds (YouTube / Vimeo / SoundCloud / Spotify / native
  // audio+video). Runs before remarkRetina so retina's image-node
  // rewrites are applied to the embed-generated nodes too (e.g. a
  // retina-rewritten screenshot wrapped by a later plugin would miss
  // the halving otherwise).
  remarkEmbeds,
  // Halve the emitted width/height of high-density screenshots (macOS
  // screencaptures, `*@2x.*`, etc.) so they render at the intended CSS-pixel
  // size instead of being inflated 2× by the source file's natural
  // dimensions. Runs last so earlier plugins have already done their AST
  // rewrites; we only operate on `image` nodes.
  remarkRetina,
];

// Stable `id` attributes on every heading — both the build-time
// heading-anchor injection (`rehypeHeadingAnchors` below, which reads
// `heading.id` to build `#…` permalinks next to each heading) and the
// optional right-rail `TableOfContents` (which uses the same slugs as
// the TOC's anchor targets) depend on this running first.
// rehypeCallouts runs second so its `details.callout` containers sit
// outside the heading-anchor and lazy-image transforms, which operate
// at the heading and img level respectively.
const rehypePre: AstroPluggableList = [
  rehypeSlug,
  rehypeCallouts,
  // Promote a Markdown image `title` (`![alt](src "title")`) into a real
  // `<figure><figcaption>` wrap. Runs before the lazy plugin so the latter
  // still sees the inner `<img>` regardless of nesting; the wrap is a
  // structural change that doesn't conflict with the loading-attribute
  // defaults applied downstream.
  rehypeFigureCaption,
  // Last so it sees every `<img>` regardless of which earlier plugin
  // (e.g. rehype-callouts) produced it. Sets `loading="lazy"` +
  // `decoding="async"` on body images and protects the LCP candidate
  // (first image) with `loading="eager"` + `fetchpriority="high"`.
  rehypeLazyImages,
  // Heading-anchor injection runs AFTER rehype-slug (which it depends
  // on for heading `id` attributes) and AFTER rehype-callouts /
  // rehype-figure-caption / rehype-lazy-images so it sees every
  // heading regardless of which earlier plugin produced it. Appends a
  // single `<a class="heading-link …" aria-label="Permalink to this
  // heading" href="#…"><span aria-hidden="true">#</span></a>` to each
  // h2..h6, plus a `group` class on the heading itself so Tailwind's
  // `group-hover:` variant resolves. Matches the inline `addHeadingLinks()`
  // script that previously lived in
  // `src/pages/posts/[...slug]/index.astro` — that script has been
  // removed in favour of this build-time plugin. Positioned BEFORE
  // rehypeExternalLinks so external-links remains the literal last
  // plugin (matching its "see every <a> regardless of who produced it"
  // contract). See `src/utils/rehypeHeadingAnchors.ts` for escape
  // hatches (`.no-heading-anchors` class, `data-no-heading-anchors`
  // attribute, nested-in-`<a>` rule, idempotency).
  rehypeHeadingAnchors,
  // External-link rewriter runs AFTER the lazy-image pass so it sees
  // every `<a>` regardless of which earlier plugin produced it. Only
  // touches `<a>` nodes so it can't conflict with the image plugins;
  // ordering is for predictability, not correctness.
  [
    rehypeExternalLinks,
    {
      siteOrigin: SITE_ORIGIN,
      translationsByLocale: EXTERNAL_LINK_TRANSLATIONS,
    },
  ],
];

/**
 * Narrower union that `unified().Processor.remarkPlugins` /
 * `rehypePlugins` actually accept. `PluggableList` (from `unified`)
 * is `Array<Plugin | PluginTuple | Preset>` — the processor's slot
 * rejects `Preset` entries, so the two types are not assignable in
 * either direction. Re-stating the processor-compatible union here
 * lets `astro.config.ts` consume the export without an `as any`
 * cast (MEDIUM #28 in issues.md).
 *
 * Runtime is unchanged: every element is a function or a
 * `[function, options]` tuple, which is what the runtime `use()`
 * method already accepts.
 *
 *   `string` covers plugins referenced by name (e.g. `"remark-toc"`)
 *   — the project doesn't use this form, but we keep it for
 *   completeness so the type matches the processor's own slot.
 *
 *   `Plugin<any[], any, any>` mirrors the type parameters
 *   `unified`'s own `Pluggable` union uses. `any` (not `unknown`)
 *   because `Plugin`'s `Input` constraint is `string | Node |
 *   undefined` and `unknown` would violate that; `any` is the same
 *   loose type the upstream types use internally.
 */
// `any` is required here (mirroring `unified`'s own `Pluggable`
// union) because `Plugin`'s `Input`/`Output` parameters have
// constrained defaults (`string | Node | undefined`), and the
// exported list intentionally accepts any plugin regardless of
// its narrower input/output type — the actual narrowing happens
// at the call site via each plugin's own `Plugin<[Options]>`
// type annotation.
export type AstroPluggable =
  /* eslint-disable @typescript-eslint/no-explicit-any */
  | string
  | [string, any]
  | Plugin<any[], any, any>
  | [Plugin<any[], any, any>, any];
/* eslint-enable @typescript-eslint/no-explicit-any */
export type AstroPluggableList = AstroPluggable[];

export const remarkPlugins: AstroPluggableList = remarkPre;
export const rehypePlugins: AstroPluggableList = rehypePre;
