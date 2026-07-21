/**
 * Backward-compat re-export. Source of truth moved to
 * `src/utils/contentPaths.ts` (T3-1 issues.md; extended with the
 * `*SlugSegments` no-leading-slash variants for T2-4). Existing
 * call sites that imported `getGallerySlug` / `getGalleryUrl` /
 * `GALLERIES_BASE` from this file keep working without churn, and
 * new code can adopt `getGallerySlugSegments` for Astro-conventional
 * `params: { slug: ... }` use. The base constant is re-exported
 * here (it lived on this module before T3-1) so the public surface
 * stays unchanged.
 */
export {
  getGallerySlug,
  getGalleryUrl,
  getGallerySlugSegments,
  GALLERIES_BASE,
} from "./contentPaths";
