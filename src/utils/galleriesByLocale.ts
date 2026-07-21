import type { CollectionEntry } from "astro:content";
import { getLocaleFromPost } from "./getLocaleFromPost";

/**
 * Returns a `getCollection` filter that matches gallery entries whose
 * detected locale equals `locale`. Mirrors `postsByLocale` /
 * `projectsByLocale` for the galleries collection; locale is derived
 * from the leading folder under `src/content/galleries/<locale>/...`.
 */
export function galleriesByLocale(
  locale: string
): (entry: CollectionEntry<"galleries">) => boolean {
  // P2-39: `getLocaleFromPost` is now structurally typed; pass the
  // entry directly instead of rebuilding `{ id, filePath }` with a
  // cast (mirrors projectsByLocale.ts).
  return entry => getLocaleFromPost(entry) === locale;
}
