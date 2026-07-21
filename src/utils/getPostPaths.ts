/**
 * Backward-compat re-export. Source of truth moved to
 * `src/utils/contentPaths.ts` (T3-1 issues.md; extended with the
 * `*SlugSegments` no-leading-slash variants for T2-4). Existing
 * call sites that imported `getPostSlug` / `getPostUrl` from
 * this file keep working without churn, and new code can adopt
 * `getPostSlugSegments` for Astro-conventional
 * `params: { slug: ... }` use.
 */
export { getPostSlug, getPostUrl, getPostSlugSegments } from "./contentPaths";
