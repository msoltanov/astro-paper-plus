import type { CollectionEntry } from "astro:content";
import { postFilter } from "./postFilter";
import { parseDateInTzMs } from "./parseDateInTz";

/**
 * Returns posts that are eligible to be shown to users, sorted by "last updated"
 * descending (uses `modDatetime` when present, otherwise `pubDatetime`).
 *
 * Note: filtering respects drafts and scheduled posts via `postFilter()`.
 * Both filtering and sorting use `parseDateInTz` so that frontmatter
 * dates without an explicit timezone marker are interpreted in the
 * post's declared `timezone` (or `config.site.timezone` as fallback) —
 * keeping the absolute UTC moment consistent across build
 * environments.
 */
export function getSortedPosts(posts: CollectionEntry<"posts">[]) {
  const resolveMs = (entry: CollectionEntry<"posts">["data"]) =>
    parseDateInTzMs(entry.modDatetime ?? entry.pubDatetime, entry.timezone);

  return posts.filter(postFilter).sort(
    // P2-3: full-millisecond comparison. The previous
    // `Math.floor(... / 1000)` discarded sub-second precision, so a
    // batch of posts published in the same second tied on sort key
    // and the cross-post order became non-deterministic
    // (V8 / SpiderMonkey differ on stable sort guarantees for
    // equal-key entries).
    (a, b) => resolveMs(b.data) - resolveMs(a.data)
  );
}
