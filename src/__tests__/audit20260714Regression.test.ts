/**
 * Regression tests for the four HIGH issues fixed in the 2026-07-14
 * audit (see `issues.md` H1..H4). Each test reads the live source and
 * pins a single concrete contract so a future PR can't silently
 * re-introduce one of the bugs.
 *
 * Reading source rather than running Astro keeps the tests fast
 * (no `astro build` round-trip) and exact (no dependence on
 * filesystem layout details like trailing slashes).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";
import { galleryPaths, archivesPaths } from "@/utils/featurePages";
import config from "@/config";

const here = dirname(urlToPath(import.meta.url));
// `here` is `src/__tests__/`, so `..` lands in `src/`. Tests for
// `pages/foo.astro` therefore use `read("pages/foo.astro")` without a
// `src/` prefix.
const srcRoot = resolve(here, "..");
const read = (p: string) => readFileSync(resolve(srcRoot, p), "utf8");

/* ---------------------------------------------------------------------- *
 * H1 — paginated post indexes must not emit hreflang on page 2+
 * ---------------------------------------------------------------------- */

const defaultPage = read("pages/posts/[...page].astro");
const localePage = read("pages/[locale]/posts/[...page].astro");

describe("H1 — paginated post indexes suppress hreflang on page 2+", () => {
  it("default-locale page gates hrefByLocale on page.currentPage === 1 → : undefined", () => {
    // Source-level contract: the `hrefByLocale` declaration in the
    // frontmatter must gate on `page.currentPage === 1`, falling back
    // to `undefined` for page 2+. The Layout gets the pre-gated value
    // via the unconditional prop pass-through.
    expect(defaultPage).toMatch(
      /const\s+hrefByLocale[\s\S]*?page\.currentPage\s*===\s*1[\s\S]*?:\s*undefined/
    );
    // The Layout's hrefByLocale prop is the unconditional passthrough
    // (`{hrefByLocale}`); the gate lives in the const declaration above.
    expect(defaultPage).toMatch(/hrefByLocale=\{hrefByLocale\}/);
  });

  it("per-locale page gates hrefByLocale on page.currentPage === 1 → : undefined", () => {
    expect(localePage).toMatch(
      /const\s+hrefByLocale[\s\S]*?page\.currentPage\s*===\s*1[\s\S]*?:\s*undefined/
    );
    expect(localePage).toMatch(/hrefByLocale=\{hrefByLocale\}/);
  });

  it("comments explicitly call out the canonical-vs-hreflang mismatch that motivates the gate", () => {
    // The audit comment that previously justified emitting the root
    // cluster on every page is gone — both files now describe the
    // mismatch as a problem to avoid, not a feature.
    expect(defaultPage).not.toMatch(/alternate view of the same logical/i);
    expect(localePage).not.toMatch(/alternate view of the same logical/i);
  });
});

/* ---------------------------------------------------------------------- *
 * H2 — breadcrumb JSON-LD item URLs come from raw segments, not labels
 * ---------------------------------------------------------------------- */

const breadcrumb = read("components/Breadcrumb.astro");

describe("H2 — breadcrumb JSON-LD URLs derive from raw segments, not display labels", () => {
  it("keeps a separate rawSegments array (not derived from display labels)", () => {
    // The whole point of H2 is to keep URL generation and label
    // generation from sharing the same array. The page-1 breadcrumb
    // for /posts/2/ used to splice `Posts (page 2)` into
    // `breadcrumbList`, then the JSON-LD loop did
    // `runningPath += "/" + segment.split(" ")[0]` which produced
    // `…/Posts`. The fix keeps raw route segments untouched.
    expect(breadcrumb).toMatch(/const\s+rawSegments\b/);
    expect(breadcrumb).toMatch(/const\s+displayLabels\b/);
  });

  it("never builds JSON-LD item URLs from labels containing '(' or localized characters", () => {
    // The forbidden shape: building `item` from a value that may
    // contain 'page 2', 'Записи', 'Yazılar', etc. We pin the absence
    // of `breadcrumbList[0]` (the now-removed localized label array)
    // and any `' '` split inside the JSON-LD loop.
    expect(breadcrumb).not.toMatch(/const\s+breadcrumbList\s*=/);
    expect(breadcrumb).not.toMatch(/segment\.split\(["']\s+["']\)\[0\]/);
  });

  it("uses /posts/<page>/ URL on paginated routes (not the localized label)", () => {
    // Pin: the path the JSON-LD loop writes for a `/posts/2/` page
    // must literally be `/posts/2/`, not `/Posts` or `/ru/Записи`.
    // The R6-breadcrumb refactor (unified `visibleHrefs` accumulator)
    // re-shaped the literal: the first crumb is pushed as
    // `/posts/${rawSegments[1]}` (leading slash is REQUIRED — see
    // the locale-prefix concatenation below) and subsequent crumbs
    // accumulate via `runningPath += "/${rawSegments[i]}"`. The
    // visible-nav href then reads the same `visibleHrefs[index]`, so
    // the two consumers stay in lock-step. The semantic guarantee
    // (literal /posts/2/ for the page-2 URL) is unchanged — only
    // the source location moved from a per-iteration `runningPath +=`
    // to a one-time push.
    expect(breadcrumb).toMatch(
      /visibleHrefs\.push\(\s*`\/posts\/\$\{rawSegments\[1\][!]?}`/
    );
    expect(breadcrumb).toMatch(
      /runningPath\s*\+=\s*`\/\$\{rawSegments\[i\][!]?}`/
    );
  });

  it("R6 fixup: visibleHrefs entries are absolute paths (leading /) so locale-prefix concat doesn't double-strip", () => {
    // Without a leading slash, `localePrefix + visibleHrefs[0]` on a
    // non-default locale produced `/ruposts/` instead of `/ru/posts/`
    // (the JSON-LD loop concatenates `/ru` + `posts` = `/ruposts`).
    // The contract is: every entry in `visibleHrefs` starts with `/`,
    // so `${localePrefix}${visibleHrefs[i]}` is well-formed for both
    // default (localePrefix = '') and non-default locales. Both
    // branches (pagination's `visibleHrefs.push(\`/posts/...\`)`
    // AND the generic loop's `runningPath += \`/${rawSegments[i]}\``)
    // must follow this rule. The pre-fix shape (generic loop's
    // `runningPath += i === 0 ? rawSegments[i] : ...`) is gone.
    expect(breadcrumb).toMatch(
      /visibleHrefs\.push\(\s*`\/posts\/\$\{rawSegments\[1\]/
    );
    expect(breadcrumb).not.toMatch(
      /runningPath\s*\+=\s*i\s*===\s*0\s*\?\s*rawSegments\[i\]/
    );
  });

  it("renders the visible nav from `displayLabels` (not raw segments) so 'Posts (page 2)' shows", () => {
    // Visible nav regression guard: the original H2 fix swapped
    // `labelFor(index)` → `displayLabels[index]` in the markup loop.
    // A future refactor that re-uses `labelFor` would lose the
    // "Posts (page N)" visible label. The literal `displayLabels.map`
    // is rendered with `label` as the destructured item — the destructure
    // shape pins the contract.
    expect(breadcrumb).toMatch(
      /displayLabels\.map\(\s*\(\s*label\s*,\s*index\s*\)/
    );
    // The displayLabels array itself must exist and be populated for
    // paginated routes (see the `if (rawSegments[0] === "posts")`
    // branch above).
    expect(breadcrumb).toMatch(
      /displayLabels\.push\(\s*`\$\{t\.nav\.posts\}\s*\(/
    );
  });

  it("P2 — navLabels map restored (incl. galleries); decodeSegment restored", () => {
    // The H2 refactor dropped `navLabels` + `decodeSegment`, regressing
    // every non-post breadcrumb on locale pages: /ru/about rendered the
    // raw English "about" instead of "О сайте", and the JSON-LD `name`
    // on every locale page fell back to the slug. `galleries` was missing
    // from the original map and is added here so /ru/galleries reads
    // "Галереи". `archives` mirrors the pattern for /<locale>/archives/.
    expect(breadcrumb).toMatch(
      /const\s+navLabels\s*:\s*Record<string,\s*string>/
    );
    expect(breadcrumb).toMatch(/const\s+decodeSegment\s*=/);
    expect(breadcrumb).toMatch(/posts:\s*t\.nav\.posts/);
    expect(breadcrumb).toMatch(/projects:\s*t\.nav\.projects/);
    expect(breadcrumb).toMatch(/about:\s*t\.nav\.about/);
    expect(breadcrumb).toMatch(/search:\s*t\.nav\.search/);
    expect(breadcrumb).toMatch(/galleries:\s*t\.nav\.galleries/);
    expect(breadcrumb).toMatch(/archives:\s*t\.nav\.archives/);
  });

  it("P2 — non-posts displayLabels branch resolves through navLabels + decodeSegment", () => {
    // The else-branch must consult navLabels so /ru/about reads "О сайте",
    // not the raw English slug. decodeSegment is the fallback for any
    // segment that isn't pre-translated.
    expect(breadcrumb).toMatch(
      /for\s*\(\s*const\s+seg\s+of\s+rawSegments\s*\)\s*displayLabels\.push\(\s*navLabels\[seg\]\s*\?\?\s*decodeSegment\(seg\)\)/
    );
  });

  it("R6: pagination is gated on a numeric regex so non-numeric second segments fall through", () => {
    // R6 (issues.md): the previous shape keyed pagination purely on
    // `rawSegments[0] === "posts"` and unconditionally formatted the
    // second segment as `(page N)`. Mounting the component on a future
    // nested posts URL (`/posts/examples/foo/`) would render the crumb
    // as "Posts (page examples)" with a non-URL-safe JSON-LD `name`.
    // The fix guards pagination on a real numeric token via the
    // `isPaginationPage` const (used by both the label builder, the
    // JSON-LD URL builder, and the visible-nav href).
    expect(breadcrumb).toMatch(/const\s+isPaginationPage\s*=/);
    expect(breadcrumb).toMatch(/rawSegments\[1\]\s*\?\?\s*["']["']/);
    expect(breadcrumb).toMatch(/test\(rawSegments\[1\]/);
  });

  it("R6: archive root (`/posts/`) reaches the generic branch, not the pagination branch", () => {
    // `rawSegments === ["posts"]` (length 1) must NOT be classified
    // as pagination — the new `isPaginationPage` test requires both
    // `rawSegments[0] === "posts"` AND length >= 2 AND numeric.
    // The archive root must append bare "/posts" to runningPath
    // (i.e. the generic branch's `runningPath += "/${rawSegments[i]}"`
    // path), not a page number.
    expect(breadcrumb).toMatch(/rawSegments\.length\s*>=\s*2/);
    // Bug pattern from the pre-R6 code: an unconditional `length === 1`
    // branch emitting `runningPath += "/posts"` bare. The fix removed
    // that branch — the generic for-loop covers it now.
    expect(breadcrumb).not.toMatch(/runningPath\s*\+=\s*"\/posts"/);
  });

  it("R6: visible-label for archive root still resolves via navLabels.posts", () => {
    // The P3 test's regex shape (`displayLabels.push(t.nav.posts)`)
    // assumed an explicit `length === 1` branch — the R6 reshuffle
    // folded it into the generic branch, which uses
    // `navLabels[seg] ?? decodeSegment(seg)`. Pin the new shape AND
    // the structural guarantee: a future contributor must still
    // resolve the bare "posts" segment via `navLabels`, NOT via a
    // raw `decodeSegment(rawSegments[i])` literal.
    expect(breadcrumb).toMatch(
      /navLabels\[seg\]\s*\?\?\s*decodeSegment\(seg\)/
    );
    expect(breadcrumb).toMatch(/posts:\s*t\.nav\.posts/);
  });

  it("R6: visible-nav href on paginated routes uses `/posts/${rawSegments[1]}`, never the `?? '1'` fallback", () => {
    // The pagination first crumb must emit the dynamic
    // `posts/<page>` URL. The OLD bug pattern — a `?? "1"` fallback
    // that turned `rawSegments === ["posts"]` into `/posts/1/` —
    // must not return. After the R6-breadcrumb refactor the literal
    // lives in the frontmatter `visibleHrefs` accumulator; the
    // visible nav then derives its href from `visibleHrefs[index]`,
    // so pinning the literal here pins both consumers. The leading
    // `/` is required so the locale-prefix concat downstream doesn't
    // collapse `/ru` + `posts/2` into `/ruposts/2/`.
    expect(breadcrumb).toMatch(/`\/posts\/\$\{rawSegments\[1\][!]?}`/);
    expect(breadcrumb).not.toMatch(/rawSegments\[1\]\s*\?\?\s*"1"/);
  });
});

/* ---------------------------------------------------------------------- *
 * H3 — RSS feeds use localized title / description / fallback copy
 * ---------------------------------------------------------------------- */

const rssEn = read("pages/rss.xml.ts");
const rssRu = read("pages/[locale]/rss.xml.ts");
const i18nTypes = read("i18n/types.ts");

describe("H3 — RSS feeds use UIStrings.pages.feed{Description,ItemFallback}", () => {
  it("UIStrings declares the new feed strings on every locale", () => {
    expect(i18nTypes).toMatch(/feedTitle:\s*string;/);
    expect(i18nTypes).toMatch(/feedDescription:\s*string;/);
    expect(i18nTypes).toMatch(/feedItemFallback:\s*string;/);
  });

  it("default-locale feed uses useTranslations + t.pages.feed* (not config.site.description as a value)", () => {
    expect(rssEn).toMatch(/useTranslations\(\s*DEFAULT_LOCALE\s*\)/);
    expect(rssEn).toMatch(/title:\s*t\.pages\.feedTitle/);
    expect(rssEn).toMatch(/description:\s*t\.pages\.feedDescription/);
    expect(rssEn).toMatch(
      /postDescription\(post\)\s*\?\?\s*t\.pages\.feedItemFallback/
    );
    // The `config.site.description` substring can legitimately appear in
    // comments explaining the old behaviour. Pin the absence of its use
    // as a *value* in the `description:` key (the channel and per-item).
    expect(rssEn).not.toMatch(/description:\s*config\.site\.description/);
  });

  it("per-locale feed uses useTranslations + t.pages.feed* (not config.site.description as a value)", () => {
    expect(rssRu).toMatch(/useTranslations\(\s*locale\s*\)/);
    expect(rssRu).toMatch(/title:\s*t\.pages\.feedTitle/);
    expect(rssRu).toMatch(/description:\s*t\.pages\.feedDescription/);
    expect(rssRu).toMatch(
      /postDescription\(post\)\s*\?\?\s*t\.pages\.feedItemFallback/
    );
    expect(rssRu).not.toMatch(/description:\s*config\.site\.description/);
  });
});

/* ---------------------------------------------------------------------- *
 * H4 — dynamic OG image URLs are content-addressed
 * ---------------------------------------------------------------------- */

const ogConstants = read("utils/ogConstants.ts");
const postIndex = read("pages/posts/[...slug]/index.astro");
const localePostIndex = read("pages/[locale]/posts/[...slug].astro");

describe("H4 — dynamic OG image URLs carry a content hash", () => {
  it("ogConstants exports a content hash helper", () => {
    expect(ogConstants).toMatch(/export\s+function\s+ogInputsHash/);
  });

  it("Cache-Control no longer claims `immutable`", () => {
    expect(ogConstants).not.toMatch(/max-age=86400,\s*immutable/);
    expect(ogConstants).toMatch(
      /OG_CACHE_CONTROL\s*=\s*["']public,\s*max-age=86400["']/
    );
  });

  it("default-locale post page appends ?v=<hash> to the dynamic OG URL", () => {
    expect(postIndex).toMatch(/import\s*\{\s*ogInputsHash\s*\}/);
    expect(postIndex).toMatch(/\$\{postUrl\}\/index\.png\?v=\$\{hash\}/);
  });

  it("per-locale post page appends ?v=<hash> to the dynamic OG URL", () => {
    expect(localePostIndex).toMatch(/import\s*\{\s*ogInputsHash\s*\}/);
    expect(localePostIndex).toMatch(/\$\{postUrl\}\/index\.png\?v=\$\{hash\}/);
  });

  it("hash inputs include title, author, siteTitle, AND a render version", () => {
    // The version constant prevents cache from holding the image
    // across non-content changes (font pack bump, layout change).
    expect(ogConstants).toMatch(
      /OG_RENDER_VERSION\s*=\s*(?:resolveOgRenderVersion\(\)|process\.env)/
    );
    expect(ogConstants).toMatch(
      /OG_RENDER_VERSION\s*,\s*\n?\s*norm\(parts\.siteTitle\)/
    );
  });
});

/* ---------------------------------------------------------------------- *
 * H3 — RSS autodiscovery in <head> points to the locale-specific feed
 * ---------------------------------------------------------------------- */

describe("H3 — Layout advertises the per-locale RSS feed, not the default one", () => {
  it("Layout's <link rel='alternate' type='application/rss+xml'> uses rssHref (locale-aware)", () => {
    // The H3 contract: a /tr/posts/foo/ page must advertise the TR
    // feed (/tr/rss.xml), not /rss.xml. The path-resolution helper
    // `rssHref` already encodes the locale; this test pins that the
    // head link uses that const and not `getRelativeLocaleUrl(...,
    // "rss")` or a hardcoded /rss.xml literal. Regression guard for
    // any future refactor that drops the locale-aware path.
    expect(layout).toMatch(/href=\{new URL\(/); // composed absolute href, not a single-segment path
    // The RSS autodiscovery link shares its origin with the WebSite
    // JSON-LD via the `websiteOrigin` helper derived from
    // `config.site.url`. Pinning `websiteOrigin` (rather than
    // `config.site.url` directly) locks in the single-source-of-truth
    // invariant: a future contributor can't swap origin handling in
    // one spot without breaking the other. P2a subdir-deploy fix.
    expect(layout).toMatch(/websiteOrigin/);
    // The forbidden shape: hardcoded `"/rss.xml"` next to the link
    // would silently re-pin every locale page to the EN feed.
    expect(layout).not.toMatch(/href=["']\/rss\.xml["']/);
    // The forbidden composition: string-appending `rssHref` to
    // `config.site.url` double-prefixes for subdirectory deploys
    // (e.g. `https://example.com/blog/blog/rss.xml`). The contract
    // is `new URL(rssHref, websiteOrigin).href` — the URL parser
    // handles the join so the base segment from `rssHref` survives
    // exactly once.
    expect(layout).not.toMatch(/\$\{config\.site\.url\.replace/);
  });

  it("rssHref is built from activeLocaleRoot (locale-aware, never asks the i18n resolver for an rss.xml route name)", () => {
    // T2-5 (issues.md): the path-side helper must derive `rssHref`
    // from `activeLocaleRoot`, which itself is the bare prefix
    // stripped of leading/trailing slashes — never from
    // `getRelativeLocaleUrl(activeLocale, "rss.xml")`. The latter
    // depends on a route-name resolver heuristic that silently
    // breaks if `src/pages/rss.xml.ts` is ever renamed.
    expect(layout).toMatch(/activeLocaleRoot/);
    expect(layout).toMatch(/rss\.xml/);
    // The forbidden pattern: `getRelativeLocaleUrl(activeLocale, "rss.xml")`.
    expect(layout).not.toMatch(
      /getRelativeLocaleUrl\(\s*activeLocale\s*,\s*["']rss\.xml["']/
    );
  });
});

/* ---------------------------------------------------------------------- *
 * M1 / M30 — pre-paint theme-color comes from theme.css, not hardcoded;
 *             FOUC body lives in src/scripts/fouc.ts.
 * ---------------------------------------------------------------------- */

const layout = read("layouts/Layout.astro");
const themeColorTokens = read("utils/themeColorTokens.ts");
const foucScript = read("scripts/fouc.ts");

describe("M1 / M30 — pre-paint theme-color literals come from theme.css", () => {
  it("Layout imports the theme-color token helper", () => {
    expect(layout).toMatch(/themeColorScriptObject/);
  });

  it("Layout delegates the FOUC script body to `src/scripts/fouc.ts`", () => {
    // M30: the 40-line inline `<script is:inline>` block was replaced
    // with a one-liner that calls `foucScriptBody()` from a typed module
    // so the body is unit-testable rather than hidden inside the layout.
    expect(layout).toMatch(/set:html=\{foucScriptBody\(\)\}/);
    // The extracted module exists, has no hardcoded hex in its active
    // path, and reads from `window.__themeColors` to fill the meta tag.
    expect(foucScript).toMatch(
      /theme\s*===\s*"dark"\s*\?\s*colors\.dark\s*:\s*colors\.light/
    );
    expect(foucScript).not.toMatch(
      /theme\s*===\s*"dark"\s*\?\s*"#[\da-fA-F]{6}"\s*:/
    );
    expect(foucScript).toMatch(/window\.__themeColors/);
  });

  it("the injected object is set on `window.__themeColors` before the FOUC script runs", () => {
    // The source uses the helper (not a literal object) so a theme
    // update doesn't require editing Layout.astro:
    expect(layout).toMatch(
      /window\.__themeColors\s*=\s*\$\{themeColorScriptObject\(\)\}/
    );
  });

  it("themeColorTokens reads --background from theme.css at build time", () => {
    // Primary read is Vite's `?raw` (CSS inlined into the bundle at
    // build time — no fs reads from Astro's `dist/.prerender/` cwd).
    // A `node:fs` fallback exists for vitest, where `?raw` on `.css`
    // returns empty. Path resolution via `import.meta.url` keeps the
    // fallback correct regardless of cwd.
    expect(themeColorTokens).toMatch(/\.\.\/styles\/theme\.css\?raw/);
    expect(themeColorTokens).toMatch(/fileURLToPath/);
    expect(themeColorTokens).toMatch(/--background/);
    expect(themeColorTokens).toMatch(/#[0-9a-fA-F]{6}/);
  });
});

/* ---------------------------------------------------------------------- *
 * M2 — release posts reference their own versioned asset
 * ---------------------------------------------------------------------- */

const enRelease = read("content/posts/en/_releases/astro-paper-plus-v7.md");
const ruRelease = read("content/posts/ru/_releases/astro-paper-plus-v7.md");

describe("M2 — release posts reference the versioned v7 asset", () => {
  it("EN release post ogImage matches the page version", () => {
    expect(enRelease).toMatch(/ogImage:\s*assets\/AstroPaper\+-v7\.png/);
    expect(enRelease).not.toMatch(/AstroPaper\+-v6\.png/);
  });

  it("EN release post body uses the v7 image", () => {
    expect(enRelease).toMatch(/!\[[^\]]*\]\(assets\/AstroPaper\+-v7\.png\)/);
  });

  it("RU release post ogImage matches the page version", () => {
    expect(ruRelease).toMatch(/ogImage:\s*assets\/AstroPaper\+-v7\.png/);
    expect(ruRelease).not.toMatch(/AstroPaper\+-v6\.png/);
  });

  it("RU release post body uses the v7 image", () => {
    expect(ruRelease).toMatch(/!\[[^\]]*\]\(assets\/AstroPaper\+-v7\.png\)/);
  });
});

/* ---------------------------------------------------------------------- *
 * M3 — Layout does not emit duplicate <meta name="title">
 * ---------------------------------------------------------------------- */

describe("M3 — <title> is the single source of document title meta", () => {
  it('Layout no longer emits <meta name="title" ...>', () => {
    expect(layout).not.toMatch(/<meta\s+name="title"/);
  });

  it("Layout still emits <title> + og:title (canonical surfaces)", () => {
    expect(layout).toMatch(/<title>\{title\}<\/title>/);
    expect(layout).toMatch(/og:title/);
  });
});

/* ---------------------------------------------------------------------- *
 * L8 — site.dir fallback was removed; getLocaleDir() now handles the
 *       unknown-locale fallback internally (returns "ltr" for any
 *       locale absent from LOCALE_DIR, so the ?? site.dir chain was
 *       dead code).
 * ---------------------------------------------------------------------- */

describe("L8 — site.dir fallback removed; getLocaleDir carries the unknown-locale case", () => {
  it("Layout uses getLocaleDir(activeLocale) without a ?? site.dir fallback", () => {
    expect(layout).toMatch(/docDir\s*=\s*getLocaleDir\(\s*activeLocale\s*\)/);
    expect(layout).not.toMatch(
      /getLocaleDir\(activeLocale\)\s*\?\?\s*site\.dir/
    );
  });
});

/* ---------------------------------------------------------------------- *
 * Archives route (showArchives gate + i18n hreflang + nav labels)
 * ---------------------------------------------------------------------- */

const archivesDefault = read("pages/archives/[...index].astro");
const archivesLocale = read("pages/[locale]/archives.astro");
const archivesBody = read("components/ArchivesBody.astro");
const header = read("components/Header.astro");
const nginxConf = read("../nginx.conf");

describe("archives route (showArchives gate + i18n hreflang)", () => {
  it("default-locale route gates getStaticPaths on !config.features.showArchives → : []", () => {
    // Without the gate, the file always rendered the page even when
    // the user disabled the feature via `astro-paper.config.ts`,
    // contradicting the documented behaviour ("flip to false to drop
    // both the route and the nav link"). The Header link is already
    // gated on the same flag, so the two must stay in lock-step.
    expect(archivesDefault).toMatch(
      /export\s+const\s+getStaticPaths\s*=\s*archivesPaths/
    );
    expect(archivesDefault).toMatch(
      /import\s*\{[^}]*archivesPaths[^}]*\}\s*from\s*["']@\/utils\/featurePages["']/
    );
  });

  it("locale-prefixed route gates getStaticPaths on !config.features.showArchives → : []", () => {
    expect(archivesLocale).toMatch(
      /if\s*\(\s*!\s*config\.features\.showArchives\s*\)\s*return\s*\[\]/
    );
    expect(archivesLocale).toMatch(/getStaticPaths\s*\(\s*\)/);
  });

  it("default-locale route passes hrefByLocale to Layout via hrefByLocaleForStaticRoute('archives', …)", () => {
    // The static-route hreflang helper already includes 'archives'
    // in its allowed-logical-names set; the default page must wire
    // the result into Layout so the head emits the full hreflang
    // cluster (en/ru/tr + x-default).
    expect(archivesDefault).toMatch(
      /hrefByLocaleForStaticRoute\(\s*["']archives["']/
    );
    expect(archivesDefault).toMatch(/hrefByLocale=\{hrefByLocale\}/);
  });

  it("locale-prefixed route passes hrefByLocale to Layout via hrefByLocaleForStaticRoute('archives', …)", () => {
    expect(archivesLocale).toMatch(
      /hrefByLocaleForStaticRoute\(\s*["']archives["']/
    );
    expect(archivesLocale).toMatch(/hrefByLocale=\{hrefByLocale\}/);
  });

  it("Header link uses t.nav.archives (not a hardcoded English literal)", () => {
    // Hardcoded "Archives" would render English on /ru/archives/ and
    // /tr/archives/ even though every surrounding nav link is
    // localized. The fix routes the label through `t.nav.archives`.
    expect(header).toMatch(/t\.nav\.archives/);
    // Pin the absence of the pre-fix hardcoded literal in the
    // archives nav branch (a stray copy-paste from a previous shape).
    expect(header).not.toMatch(
      /href=\{getRelativeLocaleUrl\(locale,\s*["']archives["']\)[\s\S]{0,200}>\s*Archives\s*</
    );
  });

  it("ArchivesBody pageTitle is sourced from t.pages.archivesTitle (not a hardcoded literal)", () => {
    // The body title was also rendered in English on locale pages.
    // Pin the localized title source so a future regression that
    // reverts to a string literal gets caught.
    expect(archivesBody).toMatch(/pageTitle=\{t\.pages\.archivesTitle\}/);
  });

  it("R1: default-locale route uses a dynamic rest-param, not a static file", () => {
    // The static `src/pages/archives.astro` silently ignored its
    // `getStaticPaths` export (Astro only calls `getStaticPaths` on
    // dynamic routes). The fix renames it to `[...index].astro` with
    // `params: { index: undefined }` so the gate actually drops the
    // page when `showArchives` is false.
    expect(archivesDefault).toMatch(/pages\/archives\/\[\.\.\.index\]\.astro/);
  });

  it("R1: archives.astro title uses t.pages.archivesTitle (matches ArchivesBody)", () => {
    // The previous `<Layout title={\`Archives | ${config.site.title}\`} />`
    // hardcoded English `"Archives"` even on the default-locale
    // default-locale route. The locale-prefixed sibling already uses
    // `t.pages.archivesTitle` — mirror that contract so a future
    // contributor who adds another default-locale variant doesn't
    // silently leak English.
    expect(archivesDefault).toMatch(
      /title=\{`\$\{t\.pages\.archivesTitle\}\s*\|\s*\$\{config\.site\.title\}`/
    );
    expect(archivesDefault).toMatch(/useTranslations\(\s*DEFAULT_LOCALE\s*\)/);
  });

  it("ArchivesBody groups by the post's effective timezone (Intl + timeZone), not UTC day", () => {
    // Regression: the previous shape read
    // `new Date(parseDateInTzMs(...)).getUTCFullYear()` which puts a
    // `2026-01-01T00:30:00+05:00` post under 2025 and renders
    // `12/31` below. The grouping logic was extracted to
    // `src/utils/archivesGrouping.ts` so it can be unit-tested
    // without booting Astro. The component imports the helper and
    // renders the result, so the source-level checks live in two
    // places:
    //   1. `archivesGrouping.ts` uses Intl.DateTimeFormat + timeZone.
    //   2. `ArchivesBody.astro` does NOT carry the old UTC-based
    //      getUTC{FullYear,Month,Date} calls (those would re-appear
    //      if someone "optimised" the rendering path back into the
    //      component).
    const archivesGrouping = read("utils/archivesGrouping.ts");
    // L18: the `new Intl.DateTimeFormat("en-CA", …)` call moved into
    // a module-level `getDtf(timezone)` cache so the formatter is
    // constructed once per timezone instead of once per post. The
    // audit only pins the FORMATTER OPTIONS (locale pinned to en-CA,
    // year/month/day numeric, timeZone keyed off the resolved
    // string), so the regex matches the formatter construction
    // inside the cache helper.
    expect(archivesGrouping).toMatch(
      /new Intl\.DateTimeFormat\(\s*["']en-CA["'][\s\S]*?timeZone:\s*timezone/
    );
    expect(archivesBody).not.toMatch(/\.getUTCFullYear\(\)/);
    expect(archivesBody).not.toMatch(/\.getUTCMonth\(\)/);
    expect(archivesBody).not.toMatch(/\.getUTCDate\(\)/);
  });
});

describe("nginx — /pagefind/* security headers survive via server-level cache map", () => {
  it("/pagefind/* location blocks carry NO add_header directives (would wipe the include)", () => {
    // Regression: the previous shape put `add_header Cache-Control …`
    // inside the /pagefind/ location block. nginx's `add_header` in
    // an inner block disables inheritance of the parent block's
    // `include /etc/nginx/nginx-headers.conf;`, so every /pagefind/*
    // response dropped CSP / XCTO / XFO / Referrer-Policy /
    // Permissions-Policy / HSTS / COOP / CORP / COEP. The fix moves
    // the Cache-Control decision to the server-level `$astro_cache_control`
    // map; the location blocks only carry `try_files`.
    const pagefindBlock = nginxConf.match(
      /location\s+\/pagefind\/\s*\{[^}]*\}/
    )?.[0];
    expect(pagefindBlock).toBeDefined();
    expect(pagefindBlock).not.toMatch(/add_header/);
    expect(pagefindBlock).toMatch(/try_files\s+\$uri\s*=\s*404/);

    const pagefindJsBlock = nginxConf.match(
      /location\s+=\s*\/pagefind\/pagefind\.js\s*\{[^}]*\}/
    )?.[0];
    expect(pagefindJsBlock).toBeDefined();
    expect(pagefindJsBlock).not.toMatch(/add_header/);
    expect(pagefindJsBlock).toMatch(/try_files\s+\$uri\s*=\s*404/);
  });

  it("the $astro_cache_control map carries Pagefind rules (pagefind.js + /pagefind/)", () => {
    // Both Pagefind paths must be in the map so the server-level
    // `add_header Cache-Control $astro_cache_control always;` line
    // ships the right value WITHOUT falling into the location-level
    // `add_header` (which would strip the security headers).
    //
    // The quote goes BEFORE the `~`, not after it. These assertions
    // previously matched `~"regex"`, which is the form nginx silently
    // mis-parses (the quotes are kept as literal characters because
    // they don't start the token, so the rule never fires) — so this
    // test was actively pinning the broken syntax in place. See
    // `nginxCacheControlMap.test.ts` for the full write-up and the
    // guard that now enforces the quoting form across every rule.
    expect(nginxConf).toMatch(
      /"~\^?\/pagefind\/pagefind\\\.js\$"\s+"public,\s*max-age=31536000,\s*immutable"/
    );
    expect(nginxConf).toMatch(
      /"~\^?\/pagefind\/"\s+"public,\s*max-age=3600,\s*must-revalidate"/
    );
  });
});

/* ---------------------------------------------------------------------- *
 * #11 — post frontmatter `canonicalURL` flows through to `<link rel="canonical">`
 * ---------------------------------------------------------------------- */
describe("#11 — post frontmatter canonicalURL is honoured", () => {
  it("PostLayout forwards the canonicalURL prop to Layout", () => {
    // If a contributor accidentally drops `canonicalURL` from the
    // destructuring OR removes the `{canonicalURL}` forward, a post
    // author who sets `canonicalURL: "https://other.example.com/x"`
    // in frontmatter would silently see the URL fall back to
    // `Astro.site + Astro.url.pathname` — i.e. the field would be
    // dead-letter. The destructure + the JSX forward must both
    // reference `canonicalURL`.
    const postLayout = read("layouts/PostLayout.astro");
    expect(postLayout).toMatch(
      /const\s*\{[\s\S]*?\bcanonicalURL\b[\s\S]*?\}\s*=\s*Astro\.props/
    );
    expect(postLayout).toMatch(/\{canonicalURL\}/);
  });

  it("post detail route (default locale) forwards post.data.canonicalURL", () => {
    const page = read("pages/posts/[...slug]/index.astro");
    // `canonicalURL` is destructured from `post.data` (shorthand
    // syntax — no `=`). The downstream `<PostLayout canonicalURL>`
    // attribute is what actually carries it into the Layout chain.
    // Match a destructure block whose RHS is `post.data`, AND the
    // page later binds `canonicalURL={canonicalURL}` on the
    // `<PostLayout>` invocation. Both directions matter: the
    // destructure reads the value from frontmatter, the JSX prop
    // forwards it; either side going missing breaks the contract.
    expect(page).toMatch(/=\s*post\.data\b/);
    expect(page).toMatch(/canonicalURL=\{canonicalURL\}/);
  });

  it("post detail route ([locale] sibling) forwards post.data.canonicalURL", () => {
    const page = read("pages/[locale]/posts/[...slug].astro");
    expect(page).toMatch(/=\s*post\.data\b/);
    expect(page).toMatch(/canonicalURL=\{canonicalURL\}/);
  });
});

/* ---------------------------------------------------------------------- *
 * R1.4 — feature-flagged static routes honour their feature gates at
 *         runtime, not just in source shape. The previous pinning was
 *         regex-only against the static index files; when Astro silently
 *         dropped their dead `getStaticPaths` exports, the gates were
 *         inert and the route shipped regardless. The fix moved both
 *         routes onto dynamic rest-param patterns (`[...slug]` /
 *         `[...index]`) and extracted the path-emission logic into
 *         `src/utils/featurePages.ts` so a unit test can call it
 *         directly and assert the empty array under the off flag.
 * ---------------------------------------------------------------------- */

describe("R1.4 — feature-flagged paths drop pages when the flag is off", () => {
  it("archivesPaths returns [] when config.features.showArchives is false", () => {
    const original = config.features.showArchives;
    (config.features as Record<string, unknown>).showArchives = false;
    try {
      // Archives has no `astro:content` dependency, so this call is
      // fully testable under vitest's mocked env.
      expect(archivesPaths()).toEqual([]);
    } finally {
      (config.features as Record<string, unknown>).showArchives = original;
    }
  });

  it("archivesPaths returns the rest-param index path when showArchives is true", () => {
    const original = config.features.showArchives;
    (config.features as Record<string, unknown>).showArchives = true;
    try {
      expect(archivesPaths()).toEqual([{ params: { index: undefined } }]);
    } finally {
      (config.features as Record<string, unknown>).showArchives = original;
    }
  });

  it("galleryPaths short-circuits to [] when enableGalleries is false (no astro:content call)", async () => {
    const original = config.features.enableGalleries;
    (config.features as Record<string, unknown>).enableGalleries = false;
    try {
      // The off-path returns `[]` BEFORE any `getCollection` call,
      // so it works under the mocked astro:content (which exposes no
      // `getCollection`). A returning-non-empty-array path would
      // require a richer astro:content mock — see `pnpm build`.
      // P3 fixup: this assertion is on a Promise — without `await`,
      // vitest can finish the test before the resolver settles, so a
      // future regression in galleryPaths()'s off-path branch would
      // not reliably fail CI.
      await expect(galleryPaths()).resolves.toEqual([]);
    } finally {
      (config.features as Record<string, unknown>).enableGalleries = original;
    }
  });
});
