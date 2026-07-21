import { LOCALES, DEFAULT_LOCALE } from "../i18n/locales";
import { getLocaleFromPost } from "./getLocaleFromPost";

/**
 * Minimal structural shape required by this helper. The previous
 * `Pick<CollectionEntry<"posts">, "id" | "filePath">` constraint was
 * re-used for the projects + galleries collections (see
 * `[locale]/projects/[...slug].astro` and
 * `[locale]/posts/[...slug]/index.png.ts`), but the explicit
 * `posts` reference in the type witness was misleading — the helper
 * only needs `id` and `filePath` to derive the locale and look up
 * the entry. Generalising the constraint to the bare shape means
 * the helper's call site no longer needs a `Pick` magic incantation
 * for non-post collections.
 */
export interface GroupableEntry {
  id: string;
  filePath?: string;
}

/**
 * Group a content collection by locale in a single pass.
 *
 * Background: `getCollection("posts", postsByLocale(locale))` re-reads
 * and re-filters the full collection every time. Doing this once per
 * non-default locale (`en` / `ru` / `tr` = 2× today) means
 * ~3× the IO and parse work even though the data is identical.
 *
 * This helper loads the collection **once** via `getCollection(name)`
 * (no filter) and partitions entries by their detected locale on the
 * JS side. The default locale is excluded from the result because it
 * has its own non-`[locale]/` route pair; callers iterate the result
 * map directly without re-reading.
 *
 * Used by the post-detail route (`[locale]/posts/[...slug].astro`),
 * the project + gallery detail routes, and the per-locale OG
 * endpoint (`[locale]/posts/[...slug]/index.png.ts`).
 */
const LOCALE_SET: ReadonlySet<string> = new Set<string>(LOCALES);

export async function groupNonDefaultLocale<T extends GroupableEntry>(
  getAll: () => Promise<T[]>
): Promise<Map<string, T[]>> {
  const all = await getAll();
  const byLocale = new Map<string, T[]>();
  for (const entry of all) {
    const locale = getLocaleFromPost(entry);
    if (locale === DEFAULT_LOCALE) continue;
    if (!LOCALE_SET.has(locale)) continue;
    const bucket = byLocale.get(locale);
    if (bucket) bucket.push(entry);
    else byLocale.set(locale, [entry]);
  }
  return byLocale;
}

export const groupByLocale = groupNonDefaultLocale;
