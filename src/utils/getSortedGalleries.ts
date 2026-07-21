import type { CollectionEntry } from "astro:content";
import { parseDateInTzMs } from "./parseDateInTz";

/**
 * Returns `getCollection`-ready gallery entries sorted by:
 *   1. `featured` first (true before false)
 *   2. `pubDatetime` descending (newest first)
 *
 * Mirrors `getSortedPosts` for the galleries collection. Drafts and
 * future-scheduled galleries are filtered with `galleryFilter`.
 *
 * `entries` is a pre-filtered collection payload — typically the
 * output of `getCollection("galleries")` or `galleriesByLocale(locale)`,
 * never `undefined`. The previous docstring said "Optionally takes a
 * pre-filtered `entries` array" which contradicted the required
 * parameter; this comment pins the actual contract.
 */
export function getSortedGalleries(
  entries: CollectionEntry<"galleries">[]
): CollectionEntry<"galleries">[] {
  // T2-8: skip the `[...entries]` allocation + sort for trivially-
  // sized inputs (the sort comparator would be a no-op anyway). For
  // 0/1 entries there's no ordering to establish and the returned
  // reference can be the input itself.
  if (entries.length <= 1) return entries;
  const sorted = [...entries];
  sorted.sort((a, b) => {
    const fa = a.data.featured ? 0 : 1;
    const fb = b.data.featured ? 0 : 1;
    if (fa !== fb) return fa - fb;
    // Same timezone-aware Date parsing as posts/projects — see
    // src/utils/parseDateInTz.ts for why we don't rely on
    // `new Date(str)` directly.
    return (
      parseDateInTzMs(b.data.pubDatetime, b.data.timezone) -
      parseDateInTzMs(a.data.pubDatetime, a.data.timezone)
    );
  });
  return sorted;
}
