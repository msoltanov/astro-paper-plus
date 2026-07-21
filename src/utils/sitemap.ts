import {
  existsSync,
  readdirSync,
  readFileSync,
  openSync,
  readSync,
  closeSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { LOCALES, DEFAULT_LOCALE } from "../i18n/locales";
import { normalizeSlugOverride, deriveSlugFromFilePath } from "./contentSlug";
import { parseDateInTzCore } from "./parseDateInTzCore";

/**
 * Upper bound for frontmatter bytes read per post file.
 *
 * Markdown frontmatter is bounded by `---` delimiters at the top of the
 * file. Most posts use <1 KB; 4 KB is generous without reading the
 * entire MDX body (which can be 50–200 KB on this codebase).
 */
const FRONTMATTER_SLICE_BYTES = 4096;
const DEFAULT_SCHEDULED_POST_MARGIN_MS = 15 * 60 * 1000;

/**
 * Sitemap helpers (pure, testable in isolation).
 *
 * The custom Astro integration at `src/integrations/sitemap.ts` owns
 * the lifecycle plumbing — capturing the posts at `astro:build:setup`
 * and writing the XML files at `astro:build:done`. The shape
 * decisions live here:
 *
 *   - Which URLs are "posts" (vs listings/pagination/etc.)
 *   - How to resolve a post URL → post entry → lastmod ISO string
 *   - How to build hreflang alternates across supported locales
 *
 * Keeping these helpers pure means tests can drive them with mock
 * post data without booting Astro.
 *
 * Note on data source
 * -------------------
 * The natural API for the posts collection is `getCollection("posts")`
 * from `astro:content`. But `astro:content` is a Vite virtual module,
 * and Astro tears down Vite's module runner BEFORE `astro:build:setup`
 * fires — confirmed empirically with "Vite module runner has been
 * closed" errors. So `getCollection` is unreachable from every
 * integration hook. We read the post files from disk instead, which
 * is always available at build time.
 *
 * The structural type (`PostEntry`) mirrors `CollectionEntry<"posts">`
 * for the four fields we actually use — enough for `postLastmod`,
 * `buildPostsLookup`, and `shapePages` to work without any Astro
 * imports.
 */

// ─── Type mirror ───────────────────────────────────────────────────────

/**
 * Structural type matching `CollectionEntry<"posts">` for the four
 * fields we actually consume. Avoids the `astro:content` import
 * (which doesn't resolve at config-load or hook-load time).
 */
export interface PostEntry {
  id: string;
  filePath?: string;
  data: {
    pubDatetime: string | Date;
    modDatetime?: string | Date | null;
    timezone?: string;
    /**
     * Optional URL-slug override. When present, the sitemap emits the
     * slug path the frontmatter requests instead of the
     * filename-derived one — keeping the routes and the sitemap in
     * lock-step with the `data.slug` override added to the posts
     * collection schema.
     */
    slug?: string;
  };
}

// ─── URL parsing ────────────────────────────────────────────────────────

/**
 * Decoded locale + slug extracted from a sitemap URL, or `null` if the
 * URL is not a post page.
 *
 * URL shapes handled:
 *   - `<base>/posts/<slug>/`           → { locale: "en", slug }
 *   - `<base>/posts/<nested>/<slug>/`  → { locale: "en", slug: "<nested>/<slug>" }
 *   - `<base>/<locale>/posts/<slug>/`  → { locale, slug }
 *
 * H — locale-prefix collision guard: the previous regex
 * `^/(?:(en|ru|tr)/)?posts/(.+?)/?$` greedily matched ANY leading
 * locale code, so a post slug beginning with `en/`, `ru/`, or `tr/`
 * (e.g. `posts/en-trip-2026/`) was mis-parsed as a per-locale URL.
 * The implementation below walks segments first, so only an EXACT
 * `[locale]/posts/…` shape consumes a locale segment.
 *
 * Pagination disambiguation lives with the caller. Astro renders
 * `/posts/<n>/` as a paginated listing when `<n>` is purely numeric
 * AND no real post has that slug, but a real post CAN have a
 * purely-numeric single-segment slug (e.g. `slug: "2026"` or a
 * `2026.md` file) and the routes emit it verbatim. This function
 * therefore does NOT short-circuit on numeric slugs — it returns the
 * parsed `(locale, slug)` and the caller (`shapePages`) decides post
 * vs pagination by consulting the post lookup map: a hit goes to
 * the posts chunk (with `lastmod` + hreflang), a miss falls through
 * to the pages chunk as pagination/listing.
 */
export interface ParsedPostUrl {
  locale: string;
  slug: string;
}

const LOCALE_SET: ReadonlySet<string> = new Set(LOCALES);

export function parsePostUrl(
  url: string,
  baseUrl: string
): ParsedPostUrl | null {
  // Contract: `url` is the absolute URL produced by
  // `new URL(page.pathname, baseUrl).href` (see `shapePages`), so it
  // already has the `baseUrl` origin as a strict prefix. Query strings
  // and fragments are not produced by the sitemap builder — pages are
  // emitted via the `<loc>` element with no querystring — so the
  // `startsWith` check is safe for the inputs we actually pass.
  // `baseUrl` has any trailing slash stripped (handled by callers),
  // so `https://example.com/` and `https://example.com` both match.
  if (!url.startsWith(baseUrl)) return null;
  const rawPath = url.slice(baseUrl.length);
  if (!rawPath || rawPath === "/") return null;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  // Normalise trailing slash; the regex below anchors on `/posts/`.
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  if (!trimmed) return null;

  // Split the path into segments. Strip a single leading "/" before
  // splitting so we don't get an empty first entry.
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  // Walk the leading segments to decide if a locale prefix is present.
  // Only an EXACT match of `[locale]/posts/…` consumes the locale —
  // a slug starting with "en" is left in the slug. Any OTHER leading
  // segment before `posts` is rejected outright because Astro never
  // renders such URLs (the route templates only produce
  // `posts/<slug>/` or `<locale>/posts/<slug>/`).
  let locale: string;
  let slugSegments: string[];
  if (segments[0] === "posts") {
    // Default-locale form `/posts/<slug>/<sub>`. The slug may be one
    // or many segments; everything after `posts` is the slug.
    locale = DEFAULT_LOCALE;
    slugSegments = segments.slice(1);
  } else if (
    segments.length >= 3 &&
    LOCALE_SET.has(segments[0]!) &&
    segments[1] === "posts"
  ) {
    // `<locale>/posts/<slug>/<sub>` — consume only when BOTH the
    // locale prefix AND the literal `posts` segment match.
    locale = segments[0]!;
    slugSegments = segments.slice(2);
  } else {
    return null;
  }
  if (slugSegments.length === 0) return null;
  return { locale, slug: slugSegments.join("/") };
}

// ─── File-system loader ──────────────────────────────────────────────

/**
 * Recursively walk `dir`, calling `visit` for every file. Folders
 * prefixed with `_` are skipped — they aren't routed (see
 * `src/utils/postSlug.ts`). Symlinks are not followed: `readdirSync`
 * with `withFileTypes: true` returns `Dirent` objects whose
 * `isDirectory()` / `isFile()` describe the *link* type, not the
 * target. The previous `readdirSync` + `statSync` shape followed
 * symlinks — a cycle under `src/content/posts/` (easy to create
 * accidentally on the Linux/CI side, or via pnpm workspace
 * layouts) recursed until `ELOOP` / stack overflow, and the
 * integration's `try/catch` swallowed it into "posts chunk
 * silently missing from the sitemap" (R8).
 */
function walkFiles(dir: string, visit: (absPath: string) => void): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Descend into all directories (including _releases) — the content
      // glob `**/[^_]*.{md,mdx}` only excludes filenames starting with
      // `_`, so underscore-prefixed *directories* ARE routed and should
      // be included in the sitemap.
      walkFiles(abs, visit);
    } else if (entry.isFile()) {
      // Only skip files whose basename starts with `_` (mirrors the
      // content collection glob).
      if (entry.name.startsWith("_")) continue;
      visit(abs);
    }
  }
}

/**
 * Trim a UTF-8 byte buffer to the last valid character boundary. Bytes
 * at the tail that would form an incomplete multi-byte sequence are
 * dropped — without this, `Buffer.toString("utf-8")` would emit U+FFFD
 * replacement characters and the YAML parser would then fail on
 * otherwise-valid frontmatter whose boundary happens to fall inside
 * a Russian / Turkish / emoji glyph.
 */
function trimToUtf8Boundary(buf: Buffer): number {
  let i = buf.length;
  while (i > 0 && (buf[i - 1]! & 0b11000000) === 0b10000000) {
    i--;
  }
  return i;
}

/**
 * Read just enough of a file to extract the YAML frontmatter.
 *
 * Markdown frontmatter is bounded by `---` delimiters at the top of
 * the file. Sitemap shaping only needs `pubDatetime` / `modDatetime` /
 * `timezone` / `slug` / `draft`, so reading the first 4 KB is enough
 * for any frontmatter we expect. Falls back to the full file when the
 * closing `---` is not within the first slice — keeps giant body
 * content from changing the contract for unusual files.
 */
function readFrontmatterSlice(filePath: string): string {
  const stat = statSync(filePath);
  const maxRead = Math.min(stat.size, FRONTMATTER_SLICE_BYTES);
  if (maxRead === 0) return "";
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(maxRead);
    readSync(fd, buf, 0, maxRead, 0);
    return buf.subarray(0, trimToUtf8Boundary(buf)).toString("utf-8");
  } finally {
    closeSync(fd);
  }
}

/**
 * Parse YAML frontmatter at the start of a Markdown/MDX file. Returns
 * `{}` if no frontmatter block is present, or if the YAML is
 * malformed. The integration's tolerance for malformed input keeps a
 * single bad post from killing the entire sitemap build.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const body = content.startsWith("\uFEFF") ? content.slice(1) : content;
  if (!body.startsWith("---")) return {};
  const relativeEnd = body.slice(3).search(/\r?\n---(?:\r?\n|$)/);
  if (relativeEnd < 0) return {};
  const raw = body.slice(3, 3 + relativeEnd);
  const yaml = raw.replace(/\r\n?/g, "\n");
  try {
    return (parseYaml(yaml) as Record<string, unknown>) ?? {};
  } catch (err) {
    if (process.env.ASTRO_PAPER_PLUS_DEBUG) {
      process.stderr.write(
        `[sitemap] frontmatter parse failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    return {};
  }
}

/**
 * Walk the on-disk posts collection under `<contentDir>/posts/<locale>/`
 * and return one entry per published post. Drafts are excluded —
 * matches what Astro's post routes emit via `getStaticPaths` (which
 * calls `getSortedPosts` → `postFilter`).
 *
 * Returns `[]` for any FS error or missing directory, so the
 * integration can fail-open: write the index + pages chunk and skip
 * the posts chunk rather than crash the build.
 *
 * Skips the FS walk entirely when `command === "dev"` (passed by the
 * integration factory). Sitemaps are only emitted at build time, so
 * walking the disk during `astro dev` would just slow startup.
 */
export function loadPostsFromDisk(
  contentDir: string,
  command?: "dev" | "build" | "check",
  defaultTimezone: string = "UTC",
  scheduledMarginMs: number = DEFAULT_SCHEDULED_POST_MARGIN_MS
): PostEntry[] {
  if (command === "dev") return [];
  const postsDir = join(contentDir, "posts");
  if (!existsSync(postsDir)) return [];
  const entries: PostEntry[] = [];

  const ingest = (absPath: string): void => {
    const entry = buildPostEntry(
      absPath,
      contentDir,
      defaultTimezone,
      scheduledMarginMs
    );
    if (entry) entries.push(entry);
  };

  walkFiles(postsDir, ingest);

  return entries;
}

function buildPostEntry(
  absPath: string,
  contentDir: string,
  defaultTimezone: string,
  scheduledMarginMs: number
): PostEntry | null {
  if (!/\.(md|mdx)$/i.test(absPath)) return null;
  const content = readFrontmatterSlice(absPath);
  let fm = parseFrontmatter(content);
  if (
    content.length >= FRONTMATTER_SLICE_BYTES &&
    !/\r?\n---(?:\r?\n|$)/.test(content.slice(3))
  ) {
    let full: string;
    try {
      full = readFileSync(absPath, "utf-8");
    } catch {
      return null;
    }
    fm = parseFrontmatter(full);
  }
  if (!isPublishedFrontmatter(fm, defaultTimezone, scheduledMarginMs)) {
    return null;
  }
  const filePath = relative(contentDir, absPath).split(sep).join("/");
  return {
    id: filePath.replace(/\.(md|mdx)$/i, ""),
    filePath,
    data: {
      pubDatetime: fm.pubDatetime as string | Date,
      modDatetime: (fm.modDatetime as string | Date | null | undefined) ?? null,
      timezone: typeof fm.timezone === "string" ? fm.timezone : undefined,
      slug: normalizeSlugOverride(fm.slug) ?? undefined,
    },
  };
}

function isPublishedFrontmatter(
  fm: Record<string, unknown>,
  defaultTimezone: string,
  scheduledMarginMs: number
): boolean {
  if (fm.draft === true) return false;
  const pub = fm.pubDatetime;
  if (pub === undefined) return false;
  const tz =
    typeof fm.timezone === "string" && fm.timezone.length > 0
      ? fm.timezone
      : defaultTimezone;
  let pubMs: number;
  try {
    pubMs = parseDateInTzCore(pub as string | Date, tz).getTime();
  } catch {
    return false;
  }
  return Date.now() > pubMs - scheduledMarginMs;
}

// ─── Lookup table ──────────────────────────────────────────────────────

/**
 * Cache key for a post in the lookup map. Locale and slug separated by
 * `|` so we can't get false matches from a slug that happens to start
 * with a locale code (e.g. a post literally named `tr/foo`).
 */
type LookupKey = `${string}|${string}`;

/**
 * Stable identity for a translated set of posts — the locale-stripped,
 * `_`-prefix-segment-stripped file path BEFORE any frontmatter
 * `slug:` override. Sibling translations always share this key:
 *
 *   en/adding-new-post.mdx       -> "adding-new-post"
 *   ru/adding-new-post.mdx       -> "adding-new-post"
 *   tr/adding-new-post.mdx       -> "adding-new-post"
 *
 * Crucially, the slug OVERRIDE is NOT part of the key. The EN fork of
 * `adding-new-post` ships under the override `adding-new-posts-in-astropaper-theme`,
 * but its identity (file-path-derived slug) is still `adding-new-post` —
 * which is how we re-discover its translated siblings after the override
 * has hidden the rendered URL behind a different segment.
 */
function translationKey(entry: PostEntry): string | null {
  const derived = deriveSlugFromFilePath(entry.filePath, entry.id);
  return derived ? derived.segments.join("/") : null;
}

/**
 * Builds a `Map<translationKey, Map<locale, entry>>` so `shapePages`
 * can find every sibling translation for a post page and emit each
 * sibling's actual rendered URL (not the file-path-derived slug —
 * the override may have replaced it).
 *
 * Only entries that resolve to a real URL are included; callers can
 * trust every entry in the inner map contributes a usable hreflang
 * target.
 */
export function buildTranslationGroups(
  entries: PostEntry[]
): Map<string, Map<string, PostEntry>> {
  const groups = new Map<string, Map<string, PostEntry>>();
  for (const entry of entries) {
    const slug = deriveSlug(entry);
    const key = translationKey(entry);
    if (!slug || !key) continue;
    let inner = groups.get(key);
    if (!inner) {
      inner = new Map<string, PostEntry>();
      groups.set(key, inner);
    }
    inner.set(slug.locale, entry);
  }
  return groups;
}

/**
 * Builds a `Map<"locale|slug", entry>` from a list of post entries. The
 * integration uses this to resolve `URL → post → lastmod`. Slug
 * normalisation matches what Astro's post routes emit — see
 * `src/utils/postSlug.ts` for the equivalent.
 */
export function buildPostsLookup(
  entries: PostEntry[]
): Map<LookupKey, PostEntry> {
  const map = new Map<LookupKey, PostEntry>();
  for (const entry of entries) {
    const slug = deriveSlug(entry);
    if (!slug) continue;
    map.set(`${slug.locale}|${slug.slug}` as LookupKey, entry);
  }
  return map;
}

interface DerivedSlug {
  locale: string;
  slug: string;
}

/**
 * Reconstructs the URL slug + locale for a post. Honors the
 * frontmatter `slug:` override when present and valid (per the same
 * validation the routes apply). Falls back to the file-path layout
 * via the shared `contentSlug` helper.
 */
function deriveSlug(entry: PostEntry): DerivedSlug | null {
  const override = entry.data.slug;
  if (override) {
    // Locale detection stays file-path-based — `data.slug` is a segment
    // override only and doesn't change which locale the file belongs to.
    const fromFile = deriveSlugFromFilePath(entry.filePath, entry.id);
    return { locale: fromFile?.locale ?? DEFAULT_LOCALE, slug: override };
  }
  const derived = deriveSlugFromFilePath(entry.filePath, entry.id);
  if (!derived) return null;
  return { locale: derived.locale, slug: derived.segments.join("/") };
}

// ─── lastmod ───────────────────────────────────────────────────────────

/**
 * Resolves a `pubDatetime` / `modDatetime` value (string or Date) into
 * an ISO-8601 string, honoring the post's declared `timezone` when the
 * input is a string that lacks an explicit timezone marker.
 *
 * Returns the ISO string directly (rather than a `Date`) so it slots
 * into the sitemap XML's `<lastmod>` field without a type assertion.
 *
 * Delegates to `parseDateInTzCore` (NOT `parseDateInTz`) so this helper
 * stays config-free and safe to import during Astro's config-load phase.
 * The sitemap integration passes `defaultTimezone` in pre-resolved from
 * `config.site.timezone ?? "UTC"` at `astro.config.ts` time — see
 * `src/utils/parseDateInTzCore.ts` for the full rationale on why
 * ambiguous strings must be resolved against a declared TZ rather
 * than the build machine's local TZ.
 */
export function postLastmod(entry: PostEntry, defaultTimezone: string): string {
  const source = entry.data.modDatetime || entry.data.pubDatetime;
  return parseDateInTzCore(
    source,
    entry.data.timezone ?? defaultTimezone
  ).toISOString();
}

// ─── Page → SitemapItem shaping ────────────────────────────────────────

/**
 * Internal shape used by `shapePages`. Matches what the `sitemap`
 * package's `SitemapStream` writer consumes (subset of
 * `SitemapItemLoose`), plus our internal `hreflang` map that we
 * reshape into the writer's `links: { lang, url }[]` form downstream.
 */
export interface ShapedItem {
  url: string;
  lastmod?: string;
  hreflang?: Record<string, string>;
}

/**
 * Walks Astro's built `pages` list and produces two arrays of shaped
 * items: one for the posts chunk (post pages with `<lastmod>` and
 * hreflang alternates), one for the pages chunk (everything else).
 *
 * Pagination URLs like `/posts/2/` parse as a post-shape URL but the
 * lookup misses (no real post has a numeric-only slug) — they fall
 * through to the pages chunk unchanged.
 *
 * `staticHreflangByPathname` lets the caller inject hreflang maps for
 * non-post static routes (home, about, posts index, projects index,
 * galleries index) keyed by Astro's exact `pathname` shape. The
 * integration builds this map up-front and passes it in; pages that
 * resolve to a known static route get the full hreflang cluster
 * (all supported locales + `x-default`) attached to their sitemap entry.
 */
export function normalizeSitemapPathname(pathname: string): string {
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function shapePages(
  pages: { pathname: string }[],
  baseUrl: string,
  postsLookup: Map<LookupKey, PostEntry>,
  defaultTimezone: string,
  translationGroups?: Map<string, Map<string, PostEntry>>,
  staticHreflangByPathname?: ReadonlyMap<
    string,
    Readonly<Record<string, string>>
  >
): { posts: ShapedItem[]; pages: ShapedItem[] } {
  const postItems: ShapedItem[] = [];
  const pageItems: ShapedItem[] = [];

  // If the caller didn't pass translation groups (e.g. older tests
  // that exercise shapePages in isolation), compute them from the
  // lookup entries — preserves the pre-translation-key contract for
  // those callers.
  const groups =
    translationGroups ??
    buildTranslationGroups(Array.from(postsLookup.values()));

  const origin = baseUrl.replace(/\/$/, "");

  for (const page of pages) {
    // Astro's `astro:build:done` hook reports the root page with an
    // empty-string pathname (the leading `/` is stripped by `addPageName`).
    // Treat the empty string as the site root rather than skipping it,
    // so the most important URL of the site is included in the sitemap.
    if (page.pathname == null) continue;

    // Skip utility routes (404, search) which shouldn't appear in
    // sitemaps. `404` URLs in a sitemap are an explicit Google
    // Webmaster Tools red flag (Google treats them as "you declared
    // a URL that doesn't exist"), and `/search` is a `noindex`
    // page — surfacing it in the sitemap invites crawlers to index
    // something that asks them not to. The exclusion is
    // intentionally hardcoded here (rather than driven by a flag)
    // because these routes' SEO contract is fixed.
    const pathname = page.pathname.replace(/\/$/, "");
    if (
      pathname === "404" ||
      pathname === "search" ||
      LOCALES.some(l => pathname === `${l}/404` || pathname === `${l}/search`)
    ) {
      continue;
    }

    const url = new URL(page.pathname, baseUrl).href;
    const parsed = parsePostUrl(url, baseUrl);
    if (!parsed) {
      // Non-post, non-listing page. Look up a static-route hreflang
      // cluster from the integration-built map. Pagination, tag
      // pages, etc. just get a bare URL.
      const hreflang = staticHreflangByPathname?.get(
        normalizeSitemapPathname(page.pathname)
      );
      pageItems.push(hreflang ? { url, hreflang: { ...hreflang } } : { url });
      continue;
    }
    const key = `${parsed.locale}|${parsed.slug}` as LookupKey;
    const entry = postsLookup.get(key);
    if (!entry) {
      // Pagination, tag pages, or any URL that LOOKS like a post
      // path (matches `parsePostUrl`) but has no real entry.
      // Before falling back to a bare URL, consult the
      // static-hreflang map: pagination routes set
      // `hrefByLocaleForStaticRoute("posts", …)` on every page
      // so the cluster is shared across `/posts/`, `/posts/2/`,
      // …; tag pages likewise. Without this, the sitemap pages
      // chunk would emit bare URLs for every paginated view
      // even though the HTML head carries the cluster.
      const hreflang = staticHreflangByPathname?.get(
        normalizeSitemapPathname(page.pathname)
      );
      pageItems.push(hreflang ? { url, hreflang: { ...hreflang } } : { url });
      continue;
    }

    const item: ShapedItem = {
      url,
      lastmod: postLastmod(entry, defaultTimezone),
    };

    // Hreflang is keyed by the post's translation identity (locale-
    // stripped file path BEFORE slug override), not by rendered slug.
    // This is the H4 fix — siblings with different rendered slugs (the
    // EN override case: `adding-new-posts-in-astropaper-theme` vs the
    // ru/tr `adding-new-post`) still get grouped together.
    const groupKey = translationKey(entry);
    const siblings = groupKey ? groups.get(groupKey) : undefined;
    if (siblings && siblings.size > 1) {
      const hreflang: Record<string, string> = {};
      // Emit each sibling's *actual* rendered URL (which honors its own
      // slug override), so a crawler following the hreflang lands on a
      // real page, not a 404.
      for (const [loc, sib] of siblings) {
        const sibSlug = deriveSlug(sib);
        if (!sibSlug) continue;
        hreflang[loc] =
          loc === DEFAULT_LOCALE
            ? `${origin}/posts/${sibSlug.slug}/`
            : `${origin}/${loc}/posts/${sibSlug.slug}/`;
      }
      // x-default exists only when the default-locale sibling exists.
      // Without it, omitting x-default is more honest than inventing a
      // default from another locale.
      if (siblings.has(DEFAULT_LOCALE)) {
        const defSlug = deriveSlug(siblings.get(DEFAULT_LOCALE)!);
        if (defSlug) {
          hreflang["x-default"] = `${origin}/posts/${defSlug.slug}/`;
        }
      }
      item.hreflang = hreflang;
    }

    postItems.push(item);
  }

  return { posts: postItems, pages: pageItems };
}

/**
 * Returns the maximum ISO timestamp in `values`, or `undefined` if
 * none of them are set. Used for the `<lastmod>` on each chunk's
 * index entry — the integration records the newest modification in
 * the chunk so crawlers can detect staleness from the index alone.
 */
export function maxLastmod(values: (string | undefined)[]): string | undefined {
  let max: string | undefined;
  for (const v of values) {
    if (!v) continue;
    if (!max || v > max) max = v;
  }
  return max;
}

// ─── Built-HTML hreflang harvest ──────────────────────────────────────

export function readHreflangFromHtml(
  htmlPath: string,
  baseUrl: string
): Record<string, string> | null {
  let html: string;
  try {
    html = readFileSync(htmlPath, "utf-8");
  } catch {
    return null;
  }
  const hreflang: Record<string, string> = {};
  const re = /<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const lang = match[1]!;
    let url = match[2]!;
    if (url.startsWith("/")) {
      url = baseUrl.replace(/\/$/, "") + url;
    }
    hreflang[lang] = url;
  }
  if (!hreflang["x-default"]) {
    const fallback =
      hreflang[DEFAULT_LOCALE] ?? Object.values(hreflang).find(Boolean);
    if (fallback) hreflang["x-default"] = fallback;
  }
  return Object.keys(hreflang).length > 0 ? hreflang : null;
}

export function collectHtmlHreflang(
  distDir: string,
  dir: string,
  baseUrl: string
): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  visitHtmlDir(
    out,
    join(distDir, dir),
    segments => `/${dir}/${segments.join("/")}/`,
    baseUrl
  );
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const abs = join(distDir, locale, dir);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    visitHtmlDir(
      out,
      abs,
      segments => `/${locale}/${dir}/${segments.join("/")}/`,
      baseUrl
    );
  }
  return out;
}

function visitHtmlDir(
  out: Map<string, Record<string, string>>,
  root: string,
  pathnameFor: (segments: string[]) => string,
  baseUrl: string
): void {
  walkHtmlIndex(out, root, pathnameFor, baseUrl, []);
}

function walkHtmlIndex(
  out: Map<string, Record<string, string>>,
  dir: string,
  pathnameFor: (segments: string[]) => string,
  baseUrl: string,
  relSegments: string[]
): void {
  if (relSegments.length > 0) {
    const indexAbs = join(dir, "index.html");
    try {
      const stat = statSync(indexAbs);
      if (stat.isFile()) {
        const hreflang = readHreflangFromHtml(indexAbs, baseUrl);
        if (hreflang) {
          const pathname = pathnameFor(relSegments);
          const key = pathname.startsWith("/") ? pathname.slice(1) : pathname;
          out.set(key, hreflang);
        }
      }
    } catch {
      // no index.html at this level — keep walking subdirs.
    }
  }
  let entries;
  try {
    // R8: withFileTypes so the `isDirectory()` below describes the
    // link, not the target — sibling walker to `walkFiles` further
    // up; this one walks the built `dist/` tree where symlinks are
    // unlikely but consistency matters.
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    if (!entry.isDirectory()) continue;
    const abs = join(dir, entry.name);
    walkHtmlIndex(out, abs, pathnameFor, baseUrl, [...relSegments, entry.name]);
  }
}
