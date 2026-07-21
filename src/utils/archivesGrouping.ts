/**
 * Grouping + per-row date helpers for the `/archives/` page.
 *
 * Lives outside `src/components/ArchivesBody.astro` so the
 * timezone-aware grouping behaviour can be unit-tested without
 * booting Astro. The component imports these helpers and wires the
 * result into the render tree.
 *
 * Why timezone-aware grouping matters here
 * ----------------------------------------
 * The rest of the site reads calendar-day components through
 * `Intl.DateTimeFormat({ timeZone })` so a post's date displays in
 * the author's declared timezone. The archives page used to use
 * `getUTCFullYear()` / `getUTCMonth()` / `getUTCDate()` on the
 * already-resolved absolute `Date`, which:
 *
 *   1. Puts the post under the WRONG year when its wall-clock day
 *      straddles UTC midnight in the post's timezone. A post stamped
 *      `2026-01-01T00:30:00+05:00` is `2025-12-31T19:30:00Z` in UTC,
 *      so the old code grouped it under 2025 and rendered `12/31`
 *      instead of `01/01`.
 *   2. Reads the wrong day in the per-row `MM/DD:` label.
 *
 * The fix funnels both the group key and the row label through the
 * post's effective timezone — `post.data.timezone` (per-post override)
 * with `config.site.timezone` (site-wide default) as the fallback.
 */
import type { CollectionEntry } from "astro:content";
import { parseDateInTz } from "./parseDateInTz";
import config from "../config";

/**
 * L18: cache `Intl.DateTimeFormat` instances keyed by timezone. The
 * formatter is locale- and option-pinned (`en-CA`, year/month/day),
 * so the cache key collapses to the timezone string. `Intl.DateTimeFormat`
 * construction is expensive enough that an archives page with 500
 * posts spanning 3 timezones dropped from 500 allocations to 3 after
 * this cache.
 *
 * Cache lifetime: process-wide for the formatter `Intl.DateTimeFormat`
 * reads. The cache is keyed by the resolved `timeZone` string and is
 * INVALIDATED by:
 *
 *   - `__resetArchivesDtfCacheForTesting()` (vitest setup), and
 *   - `invalidateArchivesDtfCache()` callers when the resolved
 *     timezone genuinely changes for the running process (e.g. a
 *     multi-tenant loader swapping `config.site.timezone`).
 *
 * Per Astro 7's SSR model, a single Astro build process renders
 * pages for a single `config.site.timezone` value, so the
 * invalidate path is currently a no-op in production. The export
 * exists so a future multi-config runtime doesn't silently ship
 * archives bucketed against the wrong timezone.
 */
const dtfCache = new Map<string, Intl.DateTimeFormat>();
function getDtf(timezone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timezone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    });
    dtfCache.set(timezone, dtf);
  }
  return dtf;
}

/**
 * Drop the entire `Intl.DateTimeFormat` cache. Tests call this
 * between cases via `__resetArchivesDtfCacheForTesting`. Future
 * multi-config runtimes can call this when the active
 * `config.site.timezone` swaps underneath a live request handler.
 */
function invalidateArchivesDtfCache(): void {
  dtfCache.clear();
}

/**
 * Format `date` in the supplied `timezone` (or the site-wide default
 * when undefined) and return numeric year / month / day components
 * in that timezone.
 *
 * The locale is pinned to `en-CA` so `formatToParts` always emits
 * the `year` / `month` / `day` parts in numeric form regardless of
 * the page's display locale. The Astro `en-CA` ICU bundle ships
 * with every modern Node and browser runtime — no locale-data
 * loading required.
 *
 * Exported for tests; consumers in production should use
 * `groupPostsByYearInTz` (or the higher-level render in
 * `ArchivesBody.astro`) which composes this with the post-timezone
 * lookup.
 */
export function formatDatePartsInTz(
  date: Date,
  timezone: string | undefined
): { year: number; month: number; day: number } {
  const tz = timezone ?? config.site.timezone;
  const parts = getDtf(tz).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  for (const p of parts) {
    if (p.type === "year") year = parseInt(p.value, 10);
    else if (p.type === "month") month = parseInt(p.value, 10);
    else if (p.type === "day") day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

/** Test-only escape hatch. Vitest exercises multiple timezones and
 * needs a clean cache between cases; this avoids cross-test pollution.
 *
 * Production code that legitimately changes the active timezone
 * (e.g. a multi-tenant loader) should call `invalidateArchivesDtfCache`
 * directly. The naming split (underscore-prefixed test escape hatch,
 * public invalidate) keeps the test-only intent visible while
 * exposing the operation to runtime callers.
 */
export function __resetArchivesDtfCacheForTesting(): void {
  dtfCache.clear();
}

export { invalidateArchivesDtfCache };

/**
 * One row of the rendered archives list — the post plus its
 * month / day components resolved in the post's own timezone (so
 * `MM/DD:` matches the year group the post lands in).
 */
export interface ArchivesRow {
  post: CollectionEntry<"posts">;
  month: number;
  day: number;
}

/**
 * One year bucket — groups all posts that share a calendar year in
 * their effective timezone. Years are emitted newest-first so the
 * most recent activity is on top.
 */
export interface ArchivesYearBucket {
  year: number;
  list: ArchivesRow[];
}

/**
 * Bucket `posts` by their calendar year in each post's effective
 * timezone. Returns the buckets sorted by year descending. Within
 * each year, posts are sorted by month then day, descending (newest
 * first).
 *
 * Timezone resolution mirrors the rest of the site:
 *   1. `post.data.timezone` if set (per-post override),
 *   2. `config.site.timezone` otherwise.
 *
 * The post's `pubDatetime` is first normalised via `parseDateInTz`
 * to an absolute UTC `Date` (so the same frontmatter value resolves
 * identically across build environments), and then the year / month
 * / day components are extracted in that resolved timezone.
 */
export function groupPostsByYearInTz(
  posts: readonly CollectionEntry<"posts">[]
): ArchivesYearBucket[] {
  const yearGroups = new Map<number, ArchivesYearBucket>();
  for (const post of posts) {
    const date = parseDateInTz(post.data.pubDatetime, post.data.timezone);
    const { year, month, day } = formatDatePartsInTz(date, post.data.timezone);
    const existing = yearGroups.get(year);
    if (existing) {
      existing.list.push({ post, month, day });
    } else {
      yearGroups.set(year, { year, list: [{ post, month, day }] });
    }
  }
  const sorted = [...yearGroups.values()].sort((a, b) => b.year - a.year);
  for (const bucket of sorted) {
    bucket.list.sort((a, b) => {
      if (a.month !== b.month) return b.month - a.month;
      return b.day - a.day;
    });
  }
  return sorted;
}
