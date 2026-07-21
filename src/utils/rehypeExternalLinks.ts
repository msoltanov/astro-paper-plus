/**
 * `rehypeExternalLinks` — make every off-site link in markdown / MDX
 * open in a new tab with the security-correct `rel` attributes, and
 * announce the new-tab behaviour to assistive tech.
 *
 * Why this exists
 * ---------------
 * When a post body cites another article or a reference doc, opening
 * that link in the same tab kicks the reader out of your article and
 * forces them to use the Back button to return. New-tab is the
 * standard blog-UX fix. We also add `rel="noopener noreferrer"`
 * because:
 *
 * - `noopener` prevents the linked page from accessing
 *   `window.opener` — a known reverse-tabnabbing vector (see
 *   https://owasp.org/www-community/attacks/Reverse_Tabnabbing).
 * - `noreferrer` suppresses the `Referer` header so the destination
 *   site doesn't see your URL in its analytics.
 *
 * Accessibility note
 * ------------------
 * WCAG 2.1 SC 3.2.5 (Change on Request) recommends warning users when
 * a link opens a new window/tab. We satisfy that with a visually-
 * hidden `<span class="sr-only"> (opens in new tab)</span>` appended
 * to the link — screen readers announce "link text, (opens in new
 * tab)", sighted users see no change. The `.sr-only` utility comes
 * from Tailwind v4's default utility layer (`@import "tailwindcss"`
 * in `src/styles/global.css`).
 *
 * Author escape hatch
 * -------------------
 * Add `data-no-external="true"` to a link to keep it in-tab. Useful
 * for:
 *
 * - Same-tab links to your own subdomains if your `siteOrigin`
 *   doesn't match (e.g. `docs.example.com` from `blog.example.com`).
 * - Citation anchors where you actually want the back-button flow.
 *
 * Scope
 * -----
 * This plugin only touches the markdown / MDX body. External `<a>`
 * tags in `.astro` files (headers, footers, sidebars) are NOT
 * processed — use Astro's `<a>` with explicit attributes there, or a
 * small `<ExternalLink>` helper component if you need one shared
 * treatment across `.astro` and `.mdx`.
 *
 * Plugin order
 * ------------
 * Position at the end of the rehype chain. Earlier plugins don't
 * produce new `<a>` nodes (callouts, figures, lazy images all wrap
 * non-link content), so order isn't load-bearing — but keeping it
 * last matches the "see every element regardless of who produced it"
 * pattern used by `rehypeLazyImages`.
 */
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Element, ElementContent, Properties } from "hast";
import { LOCALES } from "../i18n/locales";
import { COLLECTION_DIRS } from "./contentSlug";
import { isTruthyAttr } from "./isTruthyAttr";

export interface RehypeExternalLinksOptions {
  /**
   * The site origin used as the "internal" boundary. Anything with a
   * different origin (after URL parsing) is treated as external and
   * gets `target="_blank"` + `rel="noopener noreferrer"`.
   *
   * Trailing slash is tolerated. REQUIRED — we fail closed (no
   * rewriting) if you don't supply one, because guessing wrong would
   * silently break every link on the site.
   */
  siteOrigin: string;
  /**
   * Optional locale map keyed by VFile `file.path`. When provided,
   * each link gets the announcement string in the language matching
   * the post's locale — extracted from the file path the same way
   * `getLocaleFromPost` does (e.g. `src/content/posts/ru/...` →
   * locale `"ru"`). Falls back to English when the path doesn't
   * match a known locale.
   *
   * Translation lookup is keyed by path because the build pipeline
   * is locale-agnostic per file: passing translations per-call would
   * mean rebuilding the plugin chain for every post. Reading the
   * locale from `file.path` keeps a single plugin instance while
   * still emitting locale-appropriate strings.
   */
  translationsByLocale?: Record<string, { opensInNewTab: string }>;
}

type AnchorProps = Properties;

// One-shot warn-once set for malformed href values. `console.warn`
// at the rate of "every malformed link across the whole site" would
// spam the build log; deduping by the literal href keeps the warning
// useful without becoming noise.
//
// L1 (issues.md): the previous implementation silently dropped every
// malformed href after the 20th unique entry — the set had a hard
// cap and a "stop logging" eviction policy. Distinct malformed
// values beyond the limit never reached the build log, so a
// contributor shipping a typo'd href set couldn't tell from the
// build output that anything was wrong. Rotation (drop oldest when
// at capacity) keeps the log useful regardless of how many distinct
// bad values exist.
const warnedMalformedHrefs: string[] = [];
const HREF_WARN_LIMIT = 20;

function warnMalformedHrefOnce(href: string, filePath?: string): void {
  if (warnedMalformedHrefs.includes(href)) return;
  // Evict oldest entry when at capacity so the log surface stays
  // useful even with thousands of distinct malformed hrefs.
  if (warnedMalformedHrefs.length >= HREF_WARN_LIMIT) {
    warnedMalformedHrefs.shift();
  }
  warnedMalformedHrefs.push(href);
  // Tag the warning with the source file path so an author can
  // trace a noisy build log back to the specific `.md` / `.mdx`
  // that produced the malformed href. Without this, the warning
  // is a bare href string with no provenance — issues.md #4.
  const provenance = filePath ? ` (in ${filePath})` : "";
  // eslint-disable-next-line no-console
  console.warn(
    `[rehypeExternalLinks] malformed href treated as external: ${JSON.stringify(href)}${provenance}`
  );
}

/** Test-only escape hatch. Vitest exercises multiple malformed-href
 * shapes in one file; the dedupe-by-literal set would otherwise leak
 * state between cases. */
export function __resetMalformedHrefWarningsForTesting(): void {
  warnedMalformedHrefs.length = 0;
}

/** True when `href` should NOT be rewritten: fragments, relative
 * paths, same-origin absolute URLs, protocol-relative URLs whose
 * host matches `siteOrigin`, and non-`http(s)` schemes
 * (`mailto:`, `tel:`, `javascript:`, `data:`, `sms:`). Non-http
 * schemes don't navigate to a tab, so external-tab treatment is
 * semantically wrong for them. */
function isInternalHref(
  href: string,
  siteOrigin: string,
  filePath?: string
): boolean {
  // In-page fragment, or root-relative fragment (`/#section`).
  if (href.startsWith("#")) return true;
  // Protocol-relative (`//example.com/x`) — resolve against siteOrigin.
  if (href.startsWith("//")) {
    try {
      return new URL(href, siteOrigin).origin === siteOrigin;
    } catch {
      // M — log the malformed value once and treat as EXTERNAL so
      // the link still gets `target="_blank"` + `noopener`. The
      // previous behaviour ("leave alone, don't crash") silently
      // stripped the WCAG "opens in new tab" announcement from
      // exactly the links that need it most — the ones that look
      // off-site but the build can't parse.
      warnMalformedHrefOnce(href, filePath);
      return false;
    }
  }
  // Non-http schemes — mailto:, tel:, javascript:, data:, sms:.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return true;
  // Relative or root-relative path — same-site by definition.
  if (!/^https?:\/\//i.test(href)) return true;
  // Absolute http(s) — compare origins.
  try {
    return new URL(href).origin === siteOrigin;
  } catch {
    // M — same as above: log once, treat as EXTERNAL (not internal).
    // The author's browser will navigate away regardless of how the
    // URL is mangled (URL-encoded space, broken query, & instead of
    // &amp;), so labelling it internal keeps the user on a no-target
    // link that's already broken. Treating it external preserves the
    // WCAG "(opens in new tab)" signal and lets the user at least see
    // the failure in a new tab where Back still works.
    warnMalformedHrefOnce(href, filePath);
    return false;
  }
}

/** Author opt-out. HAST strips the `data-` prefix and camelCases
 * kebab-case (the same convention used by `rehypeLazyImages`), so
 * the attribute lives in `properties.dataNoExternal`. We also accept
 * the raw form as a defensive fallback for hand-built ASTs. P2-22:
 * HTML5-truthy check (`isTruthyAttr`) — `data-no-external="1"` /
 * bare `data-no-external` are now recognised too. */
function hasNoExternalOptOut(props: AnchorProps): boolean {
  return isTruthyAttr(props.dataNoExternal ?? props["data-no-external"]);
}

/** True when the author already set `target` to a non-`_blank` value
 * on this anchor. We respect their explicit choice (e.g. forcing an
 * iframe target) and skip rewriting. */
function hasExplicitNonBlankTarget(props: AnchorProps): boolean {
  const t = props.target;
  return typeof t === "string" && t !== "" && t !== "_blank";
}

/** Build the visually-hidden announcement span. Exposed as a helper
 * so the test suite can assert on its shape without parsing the
 * rendered HTML. */
function newTabAnnouncement(message: string): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["sr-only"] },
    children: [{ type: "text", value: ` (${message})` }],
  };
}

/** Default fallback announcement when no locale-specific translation
 * is available. English is the canonical fallback because it's the
 * site's default locale and most readers can parse it. */
const DEFAULT_OPENS_IN_NEW_TAB = "opens in new tab";

/**
 * Regex metachar-safe join of `LOCALES` for the alternation in
 * `localeFromFilePath` (P2-20). Adding a locale like `"pt+BR"` or
 * a non-ASCII code would otherwise inject unescaped `+` / `(` /`)`
 * into the source regex. We strip everything outside
 * `[A-Za-z0-9_-]+` as well — that's stricter than the regex itself
 * (`LOCALES` IS the typed List<string>), but it makes the per-locale
 * match result always round-trip-able into the typed `Locale` union.
 */
const localeAlternation = LOCALES.map(l =>
  l.replace(/[^A-Za-z0-9_-]/g, "")
).join("|");

// T2-3: assert at module-load that every LOCALES entry is the
// `^[A-Za-z0-9_-]+$` shape the `.replace` strip assumes. Today
// every entry is ASCII (`en` / `ru` / `tr`) so the strip is a
// no-op; the moment a future contributor adds a non-ASCII or
// regex-metachar-bearing entry, the strip silently turns it into
// something else and `localeFromFilePath` matches the stripped
// form against file paths that don't carry the strip — surfacing
// as silently missing per-locale announcements in build output.
// Fail loud at module load instead.
for (const l of LOCALES) {
  if (l.replace(/[^A-Za-z0-9_-]/g, "") !== l) {
    throw new Error(
      `[rehypeExternalLinks] LOCALES contains a non-ASCII or ` +
        `regex-metachar-bearing code (${JSON.stringify(l)}); the ` +
        `per-locale regex strip would silently drop the non-matching ` +
        `characters. Switch to a structured per-locale resolver ` +
        `instead of a string alternation.`
    );
  }
}

/**
 * Content directories whose MDX files can carry a `<locale>/` segment
 * for this plugin's purposes. Extends `COLLECTION_DIRS` (which
 * deliberately excludes `pages` for slug-collision semantics in
 * `contentSlug.ts`) with `pages` because page-collection MDX bodies
 * also flow through this plugin and need locale-aware a11y strings.
 */
const LOCALE_BEARING_DIRS: readonly string[] = [
  ...(COLLECTION_DIRS as readonly string[]),
  "pages",
];

// T2-3 (companion to LOCALES): same shape-check for the
// LOCALE_BEARING_DIRS collection so a future `press+notes` (or
// any other regex-metachar-bearing entry) surfaces at module load
// rather than as silently-bad regex compilation or hidden
// wildcard behavior in build output.
for (const d of LOCALE_BEARING_DIRS) {
  if (d.replace(/[^A-Za-z0-9_-]/g, "") !== d) {
    throw new Error(
      `[rehypeExternalLinks] LOCALE_BEARING_DIRS contains a ` +
        `regex-metachar-bearing entry (${JSON.stringify(d)}); the ` +
        `per-dir regex strip would silently drop the non-matching ` +
        `characters. Choose a strictly-[A-Za-z0-9_-] directory name.`
    );
  }
}

/**
 * Regex metachar-safe join of `LOCALE_BEARING_DIRS` for the
 * alternation in `localeFromFilePath`. Adding a content directory
 * like `"press+notes"` would otherwise inject unescaped `+` into the
 * source regex.
 */
const collectionDirAlternation = LOCALE_BEARING_DIRS.map(d =>
  d.replace(/[^A-Za-z0-9_-]/g, "")
).join("|");

/**
 * Pull a 2-letter locale code out of a VFile path. Mirrors
 * `getLocaleFromPost` for the markdown/MDX content directory layout
 * (`src/content/<dir>/<locale>/...`).
 *
 *   `src/content/posts/ru/2026/x.md` → "ru"
 *   `src/content/posts/en/_releases/y.md` → "en"
 *   `src/content/pages/ru/about.md` → "ru"
 *   `src/content/projects/ru/x.md` → "ru"
 *   `src/content/galleries/ru/x.md` → "ru"
 *
 * Returns `undefined` when the path doesn't match the expected shape
 * — caller falls back to the default announcement.
 */
function localeFromFilePath(
  filePath: string | undefined,
  alternation: string
): string | undefined {
  if (!filePath) return undefined;
  // Match `<dir>/<locale>/...` for any locale-bearing content
  // directory. The list comes from `COLLECTION_DIRS` so adding a
  // future collection (e.g. `snippets`) here doesn't require
  // touching this plugin.
  const re = new RegExp(
    `/(?:${collectionDirAlternation})/(${alternation})(?:/|$)`
  );
  const m = re.exec(filePath);
  return m ? m[1] : undefined;
}

const rehypeExternalLinks: Plugin<[RehypeExternalLinksOptions], Root> = ({
  siteOrigin,
  translationsByLocale,
}) => {
  // Normalise: strip trailing slash so "https://x.com" and
  // "https://x.com/" compare equal as origins.
  const normalizedOrigin = siteOrigin.replace(/\/+$/, "");

  return (tree, file) => {
    // Resolve the active locale from the file path once per file —
    // every link in this file shares it, so we don't need to repeat
    // the regex match per `<a>` node.
    const locale = localeFromFilePath(file?.path, localeAlternation);
    const message =
      (locale && translationsByLocale?.[locale]?.opensInNewTab) ||
      DEFAULT_OPENS_IN_NEW_TAB;

    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const props = (node.properties ?? {}) as AnchorProps;
      const href = props.href;
      if (typeof href !== "string" || href === "") return;
      if (hasNoExternalOptOut(props)) return;
      if (hasExplicitNonBlankTarget(props)) return;
      if (isInternalHref(href, normalizedOrigin, file?.path)) {
        // #14 COR — strip a misplaced `target="_blank"` from an
        // internal href. Authors occasionally set `target=_blank`
        // by mistake on a same-site link; without this reset the
        // link opens in a new tab AND the user has no visual cue
        // that they're navigating away from the current site
        // (since the new-tab indicator only appears on EXTERNAL
        // links via this plugin). Strip the attribute so the
        // browser uses the default target (_self).
        if (props.target === "_blank") {
          delete props.target;
          node.properties = props;
        }
        return;
      }

      // External + not opted out → rewrite.
      props.target = "_blank";
      // P1-15: compose with any author-supplied rel tokens rather than
      // replacing the attribute. Authors can flag paid/sponsored links
      // with `rel="sponsored nofollow ugc"`; the previous implementation
      // would silently clobber those tokens. The set keeps every token
      // unique and preserves order (existing tokens first, then
      // noopener/noreferrer) so the attribute stays human-readable in
      // DevTools and stable for testing.
      // `rel` is a space-separated token list, so hast's canonical
      // representation is `string[]` — `rehype-parse` hands us
      // `["sponsored","nofollow"]`, NOT `"sponsored nofollow"`.
      // (@types/hast >= 3.0.5 encodes this as `rel?: Array<string>`.)
      // The old `typeof props.rel === "string"` guard therefore never
      // matched and always fell through to `""`, silently clobbering
      // the author tokens this block exists to preserve. Accept both
      // shapes: the array from the parser, and a raw string from a
      // hand-built AST.
      const relProp: unknown = props.rel;
      const existingRel = Array.isArray(relProp)
        ? relProp.map(String)
        : typeof relProp === "string"
          ? relProp.split(/\s+/)
          : [];
      // Written back as an array (the shape hast expects);
      // `hast-util-to-html` joins it back to `rel="a b c"` on output.
      props.rel = Array.from(
        new Set([...existingRel.filter(Boolean), "noopener", "noreferrer"])
      );
      node.properties = props;

      // WCAG: tell assistive tech this opens a new tab. Visually-
      // hidden text appended (not replacing) so screen readers still
      // announce the original link text first. P1-16: idempotent —
      // skip if the announcement span is already present (e.g. a
      // debug build re-ran the rehype chain). Mirrors the
      // `rehypeHeadingAnchors` "skip if span already exists" pattern.
      const children = (node.children ?? []) as ElementContent[];
      const alreadyAnnounced = children.some(child => {
        if (child.type !== "element") return false;
        if ((child as Element).tagName !== "span") return false;
        const cls = ((child as Element).properties as AnchorProps)?.className;
        // `className` per HTML spec is a string or string[]. Coerce
        // both to a single string for the membership check; anything
        // non-string (number / boolean) means "no `sr-only` token".
        const clsStr = Array.isArray(cls) ? cls.join(" ") : String(cls ?? "");
        return clsStr.split(/\s+/).includes("sr-only");
      });
      if (!alreadyAnnounced) {
        children.push(newTabAnnouncement(message));
        node.children = children;
      }
    });
  };
};

export default rehypeExternalLinks;
