/**
 * `getUniqueTags` — collect every distinct tag from a list of posts
 * and return them as `{ tag, tagName }` pairs.
 *
 *   - `tag` is the URL slug (`slugifyStr(label)`) — the segment
 *     emitted under `/tags/<slug>/`.
 *   - `tagName` is the original frontmatter label (used for the
 *     visible chip text).
 *
 * Order is alphabetical by `tagName` (using `String.localeCompare`
 * with `sensitivity: "base"` so case differences don't fragment
 * the list — "Alpha" and "alpha" appear adjacent).
 *
 * R3: this helper exists for the restored `/tags/` index pages.
 * Pre-fix, the index pages lived in `.legacy-i18n-cleanup/` and
 * never made it back into the build, so every tag page's breadcrumb
 * (and its JSON-LD `item` URL) pointed at a 404.
 */
import type { CollectionEntry } from "astro:content";
import { slugifyStr } from "./slugify";

type PostsWithTags = readonly Pick<CollectionEntry<"posts">, "data">[];

export interface UniqueTag {
  tag: string;
  tagName: string;
}

export function getUniqueTags(posts: PostsWithTags): UniqueTag[] {
  const bySlug = new Map<string, string>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const slug = slugifyStr(tag);
      if (!bySlug.has(slug)) bySlug.set(slug, tag);
    }
  }
  return [...bySlug.entries()]
    .map(([tag, tagName]) => ({ tag, tagName }))
    .sort((a, b) =>
      a.tagName.localeCompare(b.tagName, undefined, { sensitivity: "base" })
    );
}
