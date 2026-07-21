import type { AstroIntegration } from "astro";
import { SitemapStream, SitemapIndexStream } from "sitemap";
import type { SitemapItemLoose, IndexItem } from "sitemap";
import { createWriteStream, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  loadPostsFromDisk,
  buildPostsLookup,
  buildTranslationGroups,
  shapePages,
  maxLastmod,
  collectHtmlHreflang,
  normalizeSitemapPathname,
  type PostEntry,
  type ShapedItem,
} from "../utils/sitemap";
import { getStaticHreflangForPathname } from "../utils/hrefByLocaleForStaticRoute";

/**
 * Custom Astro integration that replaces `@astrojs/sitemap`.
 *
 * Writes three files into the build output:
 *   - sitemap-posts-0.xml   — individual post pages, with `<lastmod>`
 *                             derived from post frontmatter and hreflang
 *                             alternates across all supported locales.
 *   - sitemap-pages-0.xml   — everything else (listings, pagination,
 *                             tag pages, galleries, about, search, 404).
 *   - sitemap-index.xml     — `<sitemapindex>` pointing at the above
 *                             two, each carrying the max `<lastmod>`
 *                             from its chunk.
 *
 * Why we don't use `getCollection("posts")` here
 * ---------------------------------------------
 * The natural API for the posts collection is `getCollection` from
 * `astro:content`. But `astro:content` is a Vite virtual module, and
 * Astro tears down Vite's module runner before any integration hook
 * fires — confirmed empirically with "Vite module runner has been
 * closed" errors. Async `await import("astro:content")` and CJS
 * `require("astro:content")` both fail at hook time.
 *
 * So: the integration factory runs at config-load time (BEFORE Vite
 * starts the build) and reads the post files synchronously here.
 * This is plain Node code — no Vite, no virtual modules. The factory
 * then stashes the snapshot in module-level state for the
 * `astro:build:done` hook to consume.
 *
 * All the shape / load helpers live in `src/utils/sitemap.ts` and are
 * statically imported — that import path works at config-load time
 * (it's a normal Node module resolve via Astro's config loader, not
 * Vite's resolver).
 */

// ─── Captured snapshot ────────────────────────────────────────────────

/**
 * The sitemap-index filename is referenced in three places — here,
 * `src/pages/robots.txt.ts`, and `src/pages/[locale]/robots.txt.ts`.
 * P3-15 binds the three to a single const so the eventual rename of
 * `sitemap-index.xml` doesn't require tracking down every hard-coded
 * string in the codebase.
 */
export const SITEMAP_INDEX_FILENAME = "sitemap-index.xml";

let capturedPosts: PostEntry[] | null = null;

/**
 * Test-only escape hatch. Lets vitest seed the snapshot directly so
 * `shapePages` / XML writing can be exercised without booting Astro.
 */
export function setCapturedPostsForTesting(posts: PostEntry[] | null): void {
  capturedPosts = posts;
}

// ─── Integration ──────────────────────────────────────────────────────

export function resolvePageLastmod(
  sourceDateEpoch = process.env.SOURCE_DATE_EPOCH,
  cwd = process.cwd()
): string {
  if (sourceDateEpoch && /^\d+$/.test(sourceDateEpoch)) {
    const date = new Date(Number(sourceDateEpoch) * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  try {
    const seconds = execFileSync("git", ["log", "-1", "--format=%ct"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^\d+$/.test(seconds))
      return new Date(Number(seconds) * 1000).toISOString();
  } catch {}
  return new Date().toISOString();
}

export function sitemapIntegration(opts: {
  baseUrl: string;
  defaultTimezone: string;
  contentDir: string;
  scheduledMarginMs?: number;
}): AstroIntegration {
  // R12 (issues.md): the user-facing config (astro.config.ts) hands
  // us `baseUrl` straight from `astro-paper.config.ts:site.url`, which
  // carries a trailing slash by default ("…/"). Without this
  // normalisation, every helper downstream defends itself by
  // re-stripping the slash (`baseUrl.replace(/\/$/, "")` in five
  // spots). One missed `replace` in a future edit produces
  // `https://host//path` URLs in the sitemap. Normalise once at the
  // boundary so the rest of the integration trusts its input.
  const baseUrlNormalized = opts.baseUrl.replace(/\/+$/, "");
  const pageLastmod = resolvePageLastmod();

  // FS walking is deferred to `astro:build:setup` (build-only hook) so
  // `astro dev` startup doesn't pay the cost — sitemaps are only
  // emitted at build time. See module docstring for the why.
  return {
    name: "astro-paper-plus:sitemap",
    hooks: {
      "astro:build:setup": ({ logger }) => {
        try {
          capturedPosts = loadPostsFromDisk(
            opts.contentDir,
            "build",
            opts.defaultTimezone,
            opts.scheduledMarginMs
          );
        } catch (err) {
          // `logger` is available on `astro:build:setup` per Astro's
          // public type defs (verified in astro/dist/types/public/
          // integrations.d.ts), so we use it instead of `console.error`
          // — the `no-console` ESLint rule is scoped to `src/**` and
          // utility scripts shouldn't need inline disables.
          // Astro's `logger.error` accepts a single arg, so we
          // stringify `err` into the message instead of passing it
          // as a second positional argument.
          logger.error(
            `[astro-paper-plus:sitemap] failed to load posts: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          capturedPosts = [];
        }
      },
      "astro:build:done": async ({ dir, pages, logger }) => {
        if (capturedPosts === null) {
          logger.warn(
            "[astro-paper-plus:sitemap] posts snapshot not initialised; " +
              "the sitemap will be missing the posts chunk."
          );
          return;
        }
        try {
          const lookup = buildPostsLookup(capturedPosts);
          // Build translation-identity groups up-front so shapePages
          // can emit hreflang that joins siblings across slug overrides
          // (e.g. the EN fork of `adding-new-post` ships under the
          // override `adding-new-posts-in-astropaper-theme`, while ru/
          // tr ship under `adding-new-post` — same translation, two
          // rendered slugs).
          const translationGroups = buildTranslationGroups(capturedPosts);
          // Pre-compute the static-route hreflang map for the
          // non-post `pages` chunk. Iterating `pages` once and
          // resolving each pathname via the shared helper keeps the
          // URL shape in lock-step with `Layout.astro`'s head
          // annotations — both go through the same `urlForLogicalName`
          // code path, so a typo in a route file fails identically
          // in both.
          const destDir = fileURLToPath(dir);
          const staticHreflangByPathname = new Map<
            string,
            Readonly<Record<string, string>>
          >();
          for (const p of pages) {
            if (p.pathname == null) continue;
            const hreflang = getStaticHreflangForPathname(
              p.pathname,
              baseUrlNormalized
            );
            if (hreflang) {
              staticHreflangByPathname.set(
                normalizeSitemapPathname(p.pathname),
                hreflang
              );
            }
          }
          // Harvest project + gallery detail page hreflang clusters
          // from the just-built HTML. The routes emit the canonical
          // hreflang set in their `<head>`, so the sitemap mirrors
          // that exactly without re-implementing the URL or
          // translation logic. Disabled collections (e.g.
          // `enableGalleries: false`) produce empty maps.
          const projectsMap = collectHtmlHreflang(
            destDir,
            "projects",
            baseUrlNormalized
          );
          const galleriesMap = collectHtmlHreflang(
            destDir,
            "galleries",
            baseUrlNormalized
          );
          const tagsMap = collectHtmlHreflang(
            destDir,
            "tags",
            baseUrlNormalized
          );

          for (const [pathname, hreflang] of projectsMap) {
            staticHreflangByPathname.set(
              normalizeSitemapPathname(pathname),
              hreflang
            );
          }
          for (const [pathname, hreflang] of galleriesMap) {
            staticHreflangByPathname.set(
              normalizeSitemapPathname(pathname),
              hreflang
            );
          }
          for (const [pathname, hreflang] of tagsMap) {
            staticHreflangByPathname.set(
              normalizeSitemapPathname(pathname),
              hreflang
            );
          }

          const { posts: postItems, pages: pageItems } = shapePages(
            pages,
            baseUrlNormalized,
            lookup,
            opts.defaultTimezone,
            translationGroups,
            staticHreflangByPathname
          );
          for (const item of pageItems) {
            if (!item.lastmod) item.lastmod = pageLastmod;
          }
          await writeSitemaps({
            destDir,
            baseUrl: baseUrlNormalized,
            postItems,
            pageItems,
          });
          logger.info(
            `Sitemap written: ${SITEMAP_INDEX_FILENAME} + sitemap-posts-0.xml (${
              postItems.length
            } urls) + sitemap-pages-0.xml (${pageItems.length} urls)`
          );
        } catch (err) {
          logger.error(
            `[astro-paper-plus:sitemap] generation failed: ${String(err)}`
          );
        }
      },
    },
  };
}

// ─── XML writing ───────────────────────────────────────────────────────

async function writeSitemaps(args: {
  destDir: string;
  baseUrl: string;
  postItems: ShapedItem[];
  pageItems: ShapedItem[];
}): Promise<void> {
  const { destDir, baseUrl, postItems, pageItems } = args;
  mkdirSync(destDir, { recursive: true });

  // R12: `baseUrl` is already normalised at the integration factory,
  // so the helpers below trust the trailing-slash-free contract.
  const origin = baseUrl;

  await Promise.all([
    writeChunk(postItems, join(destDir, "sitemap-posts-0.xml"), baseUrl),
    writeChunk(pageItems, join(destDir, "sitemap-pages-0.xml"), baseUrl),
  ]);

  await writeIndex(
    [
      {
        url: `${origin}/sitemap-posts-0.xml`,
        lastmod: maxLastmod(postItems.map(i => i.lastmod)),
      },
      {
        url: `${origin}/sitemap-pages-0.xml`,
        lastmod: maxLastmod(pageItems.map(i => i.lastmod)),
      },
    ],
    join(destDir, SITEMAP_INDEX_FILENAME)
  );
}

async function writeChunk(
  items: ShapedItem[],
  outFile: string,
  baseUrl: string
): Promise<void> {
  // R12: `baseUrl` arrived normalised from `sitemapIntegration`.
  const hostname = baseUrl;
  const stream = new SitemapStream({ hostname });
  const fileStream = createWriteStream(outFile);
  const sortedItems = [...items].sort((a, b) =>
    a.url < b.url ? -1 : a.url > b.url ? 1 : 0
  );
  const src = Readable.from(sortedItems.map(toBaseItem));
  await pipeline(src, stream, fileStream);
}

async function writeIndex(
  entries: { url: string; lastmod?: string }[],
  outFile: string
): Promise<void> {
  const stream = new SitemapIndexStream();
  const fileStream = createWriteStream(outFile);
  const src = Readable.from(entries.map(toIndexItem));
  await pipeline(src, stream, fileStream);
}

function toBaseItem(it: ShapedItem): SitemapItemLoose {
  const item: SitemapItemLoose = { url: it.url };
  if (it.lastmod) item.lastmod = it.lastmod;
  if (it.hreflang) {
    item.links = Object.entries(it.hreflang)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([lang, url]) => ({
        lang,
        url,
      }));
  }
  return item;
}

function toIndexItem(it: { url: string; lastmod?: string }): IndexItem {
  return it.lastmod ? { url: it.url, lastmod: it.lastmod } : { url: it.url };
}
