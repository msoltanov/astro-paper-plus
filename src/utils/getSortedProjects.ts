import type { CollectionEntry } from "astro:content";
import { parseDateInTzMs } from "./parseDateInTz";

/**
 * Returns projects sorted by the same `featured → order → date-desc`
 * triple-key ordering used by both `src/pages/projects/index.astro`
 * and `src/pages/[locale]/projects/index.astro`.
 *
 * Why this exists (P2-5): the two project-listing routes used to
 * inline an identical 12-line sort; bumping the policy meant editing
 * two places (the P2 drift risk called out in `issues.md`). This
 * helper is the single source of truth — mirrors `getSortedPosts`.
 */
export function getSortedProjects(
  projects: CollectionEntry<"projects">[]
): CollectionEntry<"projects">[] {
  return projects.slice().sort((a, b) => {
    // featured first (undefined / false → bottom), then by manual
    // `order` ascending, then by date descending within each bucket.
    const fa = a.data.featured ? 0 : 1;
    const fb = b.data.featured ? 0 : 1;
    if (fa !== fb) return fa - fb;
    if (a.data.order !== b.data.order) return a.data.order - b.data.order;
    // Full-ms comparison — see P2-3 rationale on `getSortedPosts`.
    return (
      parseDateInTzMs(b.data.pubDatetime, b.data.timezone) -
      parseDateInTzMs(a.data.pubDatetime, a.data.timezone)
    );
  });
}
