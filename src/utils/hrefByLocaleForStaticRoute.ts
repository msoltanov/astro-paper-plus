/**
 * Build a `hrefByLocale` map for **non-post** static pages — home, about,
 * posts index, projects index, galleries index.
 *
 * The values are absolute URLs (per `Layout.astro`'s `hrefByLocale`
 * contract), so search-engine crawlers can resolve them directly. Each
 * locale maps to the URL of the same logical page rendered for that
 * locale (e.g. the EN `/about/` ↔ the RU `/ru/about/`).
 *
 * Why this lives here (not in `postSiblings.ts`)
 * ----------------------------------------------
 * Non-post pages don't have a "translation identity" / frontmatter
 * override story — every locale renders the same route family at the
 * same path (`/about/` vs `/ru/about/`), so the map is purely a
 * function of the current route. `postSiblings.ts` does its work by
 * walking the content collection for sibling translations of a slug;
 * no analogous scan is needed for these pages.
 *
 * Excluded page families
 * ----------------------
 * - Search (`/search`, `/<locale>/search`) — the `noindex` head meta
 *   makes hreflang pointless; crawlers ignore both.
 * - 404 — there is no translated 404 route; emitting hreflang would
 *   claim siblings that don't exist.
 *
 * `hrefByLocale` shape
 * --------------------
 * Keys: a subset of `LOCALES`. Missing keys are treated as
 * "no translation exists" by `Layout.astro` and produce no head link
 * for that locale (matches the existing post-hreflang behavior).
 */
import { LOCALES, DEFAULT_LOCALE, isSupportedLocale } from "../i18n/locales";

/**
 * Resolve `siteOrigin` to an absolute URL with a defensive try/catch
 * around `new URL()`. `Layout.astro` already validates `site` upstream,
 * but the helper is exported (and used by tests + the sitemap
 * `staticHreflangMap` consumer) without that safety net — without this
 * guard, a misconfigured `site.url` produces a cryptic
 * `TypeError: Invalid URL` deep inside the URL builder instead of a
 * labelled build-time error here.
 */
function coerceSiteOrigin(siteOrigin: string): URL {
  try {
    return new URL(siteOrigin);
  } catch (err) {
    throw new TypeError(
      `[hrefByLocaleForStaticRoute] failed to parse siteOrigin=${JSON.stringify(siteOrigin)}. ` +
        `Pass the resolved \`Astro.site.origin\` or a manually-validated \`site.url\` ` +
        `absolute URL — got: ` +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

/**
 * Logical page names whose every-locale URLs we know up front. Used
 * as a hard-coded allow-list so a typo in a route file surfaces at
 * build time (the throw below) rather than producing a silent
 * no-hreflang page in production.
 *
 * `"404"` is here so the 404 routes can emit hreflang pointing at
 * their locale siblings — without this, `dist/404.html` and
 * `dist/<locale>/404.html` have NO hreflang in their `<head>`,
 * and search engines sometimes surface the wrong-locale 404 in
 * their index (the cluster tells them all three 404 pages are
 * the same logical resource).
 */
const ALLOWED_LOGICAL_NAMES = new Set<string>([
  "",
  "about",
  "posts",
  "projects",
  "galleries",
  "tags",
  "archives",
  "404",
]);

/**
 * Build the per-locale URL for a single logical page. Pure helper
 * shared by `hrefByLocaleForStaticRoute` (Layout.astro consumer) and
 * `getStaticHreflangForPathname` / `staticHreflangMap` (sitemap
 * consumer) so the URL shape has exactly one source of truth.
 *
 * Trailing slashes are intentional: `<link rel="canonical">` for
 * `/about` and `/about/` includes the slash (Astro's directory-style
 * routing renders at `…/about/index.html`). If the hreflang sibling
 * disagrees, search engines treat the set as inconsistent and may
 * drop the whole group.
 *
 * P1-6: every emitted path is prefixed with `BASE_ROOT` (the
 * configured Astro `base`, with a trailing slash) so a user with
 * `base: "/blog"` sees hreflang siblings like
 * `https://example.com/blog/about/`, not `/about/`.
 *
 * @param logicalName - "" for home, "about", "posts", "projects",
 *   "galleries" otherwise. The caller is expected to have already
 *   validated this against `ALLOWED_LOGICAL_NAMES`.
 * @param locale - A locale from `LOCALES`.
 */
function urlForLogicalName(logicalName: string, locale: string): string {
  // #13 SEO — the 404 logical name doesn't follow the standard
  // `<name>/` directory shape (the route is `404.astro` /
  // `[locale]/404.astro`, not `404/index.astro`). Build it as a
  // literal `/<locale>/404/` URL — the trailing slash matches the
  // canonical `<link rel="canonical">` URL Astro emits for the
  // page (`https://…/404/`), and matching the canonical is what
  // hreflang requires for a cluster to be valid. The standard
  // `<name>/` path is returned for everything else.
  if (logicalName === "404") {
    const localePart = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
    return `${BASE_PREFIX}${localePart}/404/`;
  }
  const localePart = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const pagePart = logicalName === "" ? "" : `/${logicalName}`;
  return `${BASE_PREFIX}${localePart}${pagePart}/`;
}

// P1-6: respect Astro's `base` prefix. A user with `base: "/blog"`
// expects hreflang siblings to live at `https://example.com/blog/about/`
// (not `/about/`), so the URLs we emit must include the configured
// `BASE_URL` segment. Read once at module load — `import.meta.env` is
// statically replaced by Vite/Astro at build time and never changes.
const BASE_PREFIX = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
const BASE_ROOT = BASE_PREFIX === "" ? "/" : `${BASE_PREFIX}/`;

/**
 * `hrefByLocaleForStaticRoute` — given the *logical* page name (the
 * path under the locale prefix, e.g. `"about"`, `"posts"`,
 * `"projects"`, `"galleries"`, or `""` for home), build the per-locale
 * URL map rooted at `siteOrigin`.
 *
 * @param logicalName - "" for home, "about", "posts", "projects",
 *   "galleries" otherwise. Throws for anything else so a typo
 *   surfaces at build time instead of producing a silent no-hreflang
 *   page.
 * @param siteOrigin - The site's origin (`Astro.site.origin`).
 * @param currentLocale - The locale of the *current* page rendering
 *   this map (its own URL is the canonical of `activeLocale`). Used
 *   only to double-check that the current page's URL matches what
 *   we'd compute for that locale.
 */
export function hrefByLocaleForStaticRoute(
  logicalName: string,
  siteOrigin: string,
  currentLocale: string
): Readonly<Record<string, string>> {
  if (!ALLOWED_LOGICAL_NAMES.has(logicalName)) {
    throw new Error(
      `[hrefByLocaleForStaticRoute] unknown logicalName ${JSON.stringify(
        logicalName
      )} — must be one of: ${[...ALLOWED_LOGICAL_NAMES].map(s => JSON.stringify(s)).join(", ")}. ` +
        `Search and 404 should NOT call this helper — they are excluded from hreflang.`
    );
  }

  const origin = coerceSiteOrigin(siteOrigin);
  const out: Record<string, string> = {};
  for (const loc of LOCALES) {
    out[loc] = new URL(urlForLogicalName(logicalName, loc), origin).href;
  }
  // Sanity: the URL we computed for the current locale must match the
  // canonical URL Astro would emit for that page — otherwise the
  // hreflang alternate disagrees with `<link rel="canonical">` and
  // search engines drop the whole set. We only log on mismatch here;
  // the throw would block the build over a config typo, which is the
  // desired behavior.
  const own = out[currentLocale];
  if (!own) {
    throw new Error(
      `[hrefByLocaleForStaticRoute] currentLocale ${JSON.stringify(currentLocale)} ` +
        `not in LOCALES — cannot build hrefByLocale.`
    );
  }
  return out;
}

export function hrefByLocaleForTag(
  tagSlug: string,
  siteOrigin: string,
  currentLocale: string,
  availableLocales: readonly string[]
): Readonly<Record<string, string>> {
  if (!tagSlug) {
    throw new Error(
      "[hrefByLocaleForTag] tagSlug must be a non-empty URL segment."
    );
  }
  if (!isSupportedLocale(currentLocale)) {
    throw new Error(
      `[hrefByLocaleForTag] currentLocale ${JSON.stringify(currentLocale)} not in LOCALES.`
    );
  }
  const requestedLocales = new Set(availableLocales.filter(isSupportedLocale));
  if (!requestedLocales.has(currentLocale)) requestedLocales.add(currentLocale);
  const origin = coerceSiteOrigin(siteOrigin);
  const out: Record<string, string> = {};
  for (const locale of LOCALES) {
    if (!requestedLocales.has(locale)) continue;
    const path = `${urlForLogicalName("tags", locale)}${encodeURIComponent(tagSlug)}/`;
    out[locale] = new URL(path, origin).href;
  }
  return out;
}

/**
 * `staticHreflangMap` — same URL building as
 * `hrefByLocaleForStaticRoute`, but with the `x-default` key added
 * per Google's hreflang spec. The default-locale URL is the canonical
 * x-default target (a crawler with no locale match lands on the
 * site's primary language).
 *
 * Used by the sitemap integration's `pages` chunk so non-post
 * non-listing pages get the same hreflang cluster as the HTML head.
 *
 * Returns `undefined` for unknown logical names so callers can early-
 * return without an exception when iterating arbitrary pathnames.
 */
export function staticHreflangMap(
  logicalName: string,
  siteOrigin: string
): Record<string, string> | undefined {
  if (!ALLOWED_LOGICAL_NAMES.has(logicalName)) return undefined;
  const origin = coerceSiteOrigin(siteOrigin);
  const map: Record<string, string> = {};
  for (const loc of LOCALES) {
    map[loc] = new URL(urlForLogicalName(logicalName, loc), origin).href;
  }
  map["x-default"] = map[DEFAULT_LOCALE];
  return map;
}

/**
 * Re-exported for tests + external callers that need the same base
 * prefix as the URL builders above (P1-6). Consumers building
 * `<link rel="canonical">` / OG `url` strings by hand should route
 * the path through `withBase` rather than re-implementing the prefix
 * concat.
 */
export const BASE_URL: string = BASE_PREFIX;
export const BASE_URL_ROOT: string = BASE_ROOT;

/**
 * `getStaticHreflangForPathname` — given a pathname emitted by
 * Astro's `astro:build:done` hook (e.g. `""`, `"/about/"`,
 * `"/ru/about/"`, `"/posts/2/"`), return the hreflang map for that
 * page if it matches one of the known static routes, or `undefined`
 * otherwise.
 *
 * Returns `undefined` for:
 *   - the 404 / search pages (no translated siblings)
 *   - post detail pages (handled by the post-hreflang path)
 *   - pagination (e.g. `/posts/2/`) — these have a single-locale URL
 *     and should NOT carry hreflang, only `<link rel="canonical">`
 *   - tag pages, project detail pages, gallery detail pages — these
 *     don't currently have locale siblings and the layout's
 *     `noindex` head meta would suppress the cluster anyway
 *
 * The returned map includes all supported locales (en, ru, tr) AND
 * `x-default`, so search engines see a complete hreflang cluster.
 */
export function getStaticHreflangForPathname(
  pathname: string,
  siteOrigin: string
): Record<string, string> | undefined {
  // Normalise: Astro sometimes reports the root as `""`, sometimes
  // as `"/"`. We strip leading and trailing slashes for matching.
  const stripped = pathname.replace(/^\//, "").replace(/\/$/, "");
  const segments = stripped === "" ? [] : stripped.split("/");

  if (segments.length > 2) return undefined;

  let logicalName: string;

  if (segments.length === 0) {
    // Root: home page.
    logicalName = "";
  } else if (segments.length === 1) {
    // Single segment — either a default-locale page (`/about/`)
    // OR a locale-prefixed home (`/ru/`, `/tr/`). We tell
    // them apart by whether the segment is a supported locale.
    const only = segments[0];
    if (isSupportedLocale(only)) {
      // Locale-prefixed home page; the logical name is the empty
      // string, same as the default-locale root.
      logicalName = "";
    } else {
      // Default-locale page: `/about/` → about.
      logicalName = only;
    }
  } else {
    // Two segments: must be `/{locale}/{name}/` where the first
    // segment is a supported locale. The locale itself isn't needed
    // for the URL build (the same logical page resolves to the same
    // URL set across locales) but we validate it so a typo in a
    // route file fails here rather than silently producing wrong
    // hreflang siblings.
    const [first, second] = segments;
    if (!isSupportedLocale(first)) return undefined;
    logicalName = second;
  }

  return staticHreflangMap(logicalName, siteOrigin);
}
