import { DEFAULT_LOCALE } from "@/i18n/locales";
import { getContentSlug, slugSegmentsFromIdOrPath } from "./contentSlug";
import { getContentUrl } from "./contentUrl";

/**
 * Per-collection content path helpers — the consolidated home for the
 * `getXxxSlug` / `getXxxUrl` family.
 *
 * T3-1 (issues.md): the previous structure had three near-identical
 * shim files (`getPostPaths.ts`, `getProjectPaths.ts`,
 * `getGalleryPaths.ts`) each declaring an identical `getXxxSlug`
 * wrapping `getContentSlug(...)`, and a `getXxxUrl` wrapping
 * `getContentUrl(collection, ...)`. Reading the helper family
 * required opening three files plus the two underlying helpers.
 *
 * This module is the single source of truth:
 *   - One factory `createContentPaths(collection)` returns a typed
 *     pair of bound methods.
 *   - Three pre-bound instances (`postPaths`, `projectPaths`,
 *     `galleryPaths`) cover the existing call sites with no
 *     surface-area change.
 *   - The collection-base constants (`POSTS_BASE`, `PROJECTS_BASE`,
 *     `GALLERIES_BASE`) are co-located here so future tests / paths
 *     referencing the on-disk folder don't each define their own.
 *
 * The three legacy files now re-export from this module — they
 * stay as named import shims so existing call sites (8 .astro
 * route / component files, RSS pipelines, pre-existing tests) keep
 * working without churn.
 */
export type ContentCollection = "posts" | "projects" | "galleries";

export interface ContentPaths {
  getSlug: (
    id: string,
    filePath: string | undefined,
    slugOverride?: string
  ) => string;
  /**
   * T2-4: Astro-conventional route-param slug (no leading slash).
   * Prefer this over `getSlug` for new `params: { slug: ... }` uses
   * in dynamic route files (`src/pages/posts/[...slug].astro` and
   * friends). Leading-slash `getSlug` is retained for href-shaped
   * consumers (Card.astro, RSS autodiscovery, sitemap slugs).
   */
  getSlugSegments: (
    id: string,
    filePath: string | undefined,
    slugOverride?: string
  ) => string;
  getUrl: (
    id: string,
    filePath: string | undefined,
    locale?: string,
    slugOverride?: string
  ) => string;
}

export function createContentPaths(
  collection: ContentCollection
): ContentPaths {
  return {
    getSlug: (id, filePath, slugOverride) =>
      getContentSlug(id, filePath, slugOverride),
    // T2-4 bundler-tree-shake workaround: reference
    // `slugSegmentsFromIdOrPath` directly here instead of through the
    // `getContentSlugSegments` alias. Some prerender chunks only
    // consume `COLLECTION_DIRS` (and indirectly the factory's shape
    // via `getLocaleFromPost`) and tree-shake `getContentSlugSegments`
    // before re-evaluating the factory's `getSlugSegments` closure,
    // which then sees a missing binding at runtime. Inlining the
    // call to the underlying helper (which IS imported in the chunk)
    // sidesteps the tree-shake. Both forms are still exported
    // (the named `*SlugSegments` aliases come from this file's
    // top-level surface) so route-file consumers see no API change.
    getSlugSegments: (id, filePath, slugOverride) =>
      slugSegmentsFromIdOrPath(id, filePath, slugOverride),
    getUrl: (id, filePath, locale = DEFAULT_LOCALE, slugOverride) =>
      getContentUrl(collection, id, filePath, locale, slugOverride),
  };
}

export const postPaths: ContentPaths = createContentPaths("posts");
export const projectPaths: ContentPaths = createContentPaths("projects");
export const galleryPaths: ContentPaths = createContentPaths("galleries");

// Backward-compat named exports. Keep in lock-step with the
// instance methods above — every test asserts on the named export
// shape, so changing one without the other would break a non-trivial
// number of vitest cases silently.
//
// T2-4: the legacy `*Slug` exports retain the leading-slash shape
// (consumed by Card.astro, RSS autodiscovery). The new `*SlugSegments`
// exports use the Astro-conventional leader-less shape for route-param
// consumers (`params: { slug: getPostSlugSegments(...) }`).
export const getPostSlug = postPaths.getSlug;
export const getPostUrl = postPaths.getUrl;
export const getProjectSlug = projectPaths.getSlug;
export const getProjectUrl = projectPaths.getUrl;
export const getGallerySlug = galleryPaths.getSlug;
export const getGalleryUrl = galleryPaths.getUrl;

export const getPostSlugSegments = postPaths.getSlugSegments;
export const getProjectSlugSegments = projectPaths.getSlugSegments;
export const getGallerySlugSegments = galleryPaths.getSlugSegments;

// On-disk content-collection roots. The URL builders don't need
// these (Astro enumerates content via `astro:content`, not via
// disk-path traversal), but the constants show up in:
//   - test setup mocks that fabricate `filePath` strings,
//   - the relative-glob form of `socialIcons.ts` and friends,
//   - diagnostics that print "which collection did this come from?".
// Co-locating them here means there's still one file to read for
// the family's full contract.
export const POSTS_BASE = "src/content/posts";
export const PROJECTS_BASE = "src/content/projects";
export const GALLERIES_BASE = "src/content/galleries";
