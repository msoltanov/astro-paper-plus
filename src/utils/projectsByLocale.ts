import type { CollectionEntry } from "astro:content";
import { getLocaleFromPost } from "./getLocaleFromPost";

/**
 * Returns a `getCollection` filter that matches projects whose detected
 * locale equals `locale`. Mirrors `postsByLocale` for the projects
 * collection; locale is derived from the leading folder under
 * `src/content/projects/<locale>/...`.
 */
export function projectsByLocale(
  locale: string
): (entry: CollectionEntry<"projects">) => boolean {
  // P2-39: `getLocaleFromPost` is now structurally typed (P2-39);
  // the per-collection wrappers no longer need to rebuild the
  // `{ id, filePath }` pair with a cast — pass the entry straight in.
  return entry => getLocaleFromPost(entry) === locale;
}
