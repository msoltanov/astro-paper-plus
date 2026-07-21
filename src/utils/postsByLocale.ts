import type { CollectionEntry } from "astro:content";
import { getLocaleFromPost } from "./getLocaleFromPost";

/**
 * Returns a `getCollection` filter that matches posts whose detected locale
 * equals `locale`. Used by both default-locale and `[locale]/...` route
 * files to scope `getCollection` to one language.
 */
export function postsByLocale(
  locale: string
): (entry: CollectionEntry<"posts">) => boolean {
  return post => getLocaleFromPost(post) === locale;
}
