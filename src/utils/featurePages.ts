/**
 * `getStaticPaths` helpers for the feature-flagged static pages
 * (`/galleries/` and `/archives/`).
 *
 * R1 (issues.md): the previous static route files
 * (`src/pages/galleries/index.astro` and `src/pages/archives.astro`)
 * were non-dynamic routes — Astro's `getStaticPaths` is a no-op on
 * non-dynamic routes, so the `enableGalleries` / `showArchives`
 * gate was dead code: the page built regardless of the flag, the
 * disabled feature had a public sitemap-advertised URL, and the
 * hreflang cluster pointed at siblings that didn't exist. The fix
 * moves both routes onto dynamic rest-param paths so the gate is
 * honoured.
 *
 * Splitting the path logic out of the .astro files lets the unit
 * test assert that `[]` is returned when the feature is off — the
 * exact regression that slipped past `audit20260714Regression` when
 * it was only source-shape pinning the static files. The off-path
 * short-circuits before any `astro:content` call, so no Astro mock
 * is needed for the regression assertion; the on-path is exercised
 * by `pnpm build` rather than unit tests.
 */
import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import config from "@/config";
import { galleriesByLocale } from "./galleriesByLocale";
import { galleryFilter } from "./galleryFilter";
import { getGallerySlugSegments } from "./getGalleryPaths";
import {
  buildContentTranslationGroups,
  findContentSiblings,
  type ContentSiblings,
} from "./contentSiblings";

type GalleryEntry = CollectionEntry<"galleries">;

export type GalleryDetailPath = {
  params: { slug: string };
  props: { kind: "detail"; gallery: GalleryEntry; siblings: ContentSiblings };
};

export type GalleryIndexPath = {
  params: { slug: undefined };
  props: { kind: "index" };
};

export type GalleryPath = GalleryDetailPath | GalleryIndexPath;

/**
 * Path list for `src/pages/galleries/[...slug].astro`.
 *
 * Returns one detail path per renderable default-locale gallery
 * PLUS one index path (`params.slug === undefined`) that makes
 * Astro render the bare `/galleries/` URL. Returns `[]` entirely
 * when `config.features.enableGalleries` is false — early-exits
 * before any `astro:content` call so the off-path is testable
 * under vitest without mocking the content collections.
 */
export async function galleryPaths(): Promise<GalleryPath[]> {
  if (!config.features.enableGalleries) return [];
  const all = await getCollection("galleries");
  const renderable = all.filter(galleryFilter);
  const entries = renderable.filter(galleriesByLocale(DEFAULT_LOCALE));
  const translationGroups = buildContentTranslationGroups(
    "galleries",
    renderable
  );
  const detailPaths: GalleryDetailPath[] = entries.map(entry => {
    const siblings = findContentSiblings("galleries", entry, translationGroups);
    const path: GalleryDetailPath = {
      params: {
        slug: getGallerySlugSegments(
          entry.id,
          entry.filePath as string | undefined,
          entry.data.slug
        ),
      },
      props: { kind: "detail" as const, gallery: entry, siblings },
    };
    return path;
  });
  // R1: rest-param index path. `slug: undefined` makes Astro render
  // the bare `/galleries/` URL. Gated by the same feature flag as
  // the detail paths; toggling `enableGalleries: false` now drops
  // the page entirely from the build. Tagged as the union variant
  // explicitly because TS can't infer `GalleryIndexPath` from a
  // bare object literal pushed into a `GalleryDetailPath[]`.
  const indexPath: GalleryIndexPath = {
    params: { slug: undefined },
    props: { kind: "index" },
  };
  return [...detailPaths, indexPath];
}

export type ArchivesPath = { params: { index: undefined } };

/**
 * Path list for `src/pages/archives/[...index].astro`.
 *
 * Returns the single rest-param index path (`params.index ===
 * undefined` → `/archives/`) when `showArchives` is true, `[]`
 * otherwise. No `astro:content` call involved.
 */
export function archivesPaths(): ArchivesPath[] {
  if (!config.features.showArchives) return [];
  return [{ params: { index: undefined } }];
}
