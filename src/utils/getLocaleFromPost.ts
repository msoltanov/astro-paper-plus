import { DEFAULT_LOCALE, isSupportedLocale } from "../i18n/locales";
import { COLLECTION_DIRS } from "./contentSlug";

// P2-11: hoisted from inside the function to module scope (the Set
// is read-only after construction). The function is called via
// `groupNonDefaultLocale` / `projectsByLocale` / `galleriesByLocale` once per
// content entry — building a fresh Set on every call was allocating
// repeatedly for nothing.
const COLLECTION_DIR_SET: ReadonlySet<string> = new Set<string>(
  COLLECTION_DIRS
);

/**
 * Structural type accepted by `getLocaleFromPost` (P2-39). The original
 * signature was `Pick<CollectionEntry<"posts">, "id" | "filePath">`,
 * which forced non-posts collections (`projects`, `galleries`) to
 * pass through a cast at every call site. All three collection
 * entries expose `id` and `filePath` of compatible shape, so the
 * structural pair is sufficient and removes the cast.
 */
export interface LocaleAwareEntry {
  id: string;
  filePath?: string;
}

/**
 * Determines the locale for a given content-collection entry by inspecting
 * its `filePath` or `id`. Folder layout under `src/content/<collection>/`:
 *
 *   src/content/posts/<locale>/...
 *   src/content/projects/<locale>/...
 *   src/content/galleries/<locale>/...
 *   src/content/posts/<locale>/<sub>/... (e.g. tr/examples/foo.mdx)
 *   src/content/posts/_drafts/<locale>/... — P1-7: leading `_`-prefixed
 *     directories are ignored so a draft at
 *     `posts/_drafts/en/foo.mdx` correctly resolves to `en`, not `en`
 *     starting from `_drafts` as if it were a locale segment.
 *
 * Falls back to `DEFAULT_LOCALE` when the prefix isn't a recognised
 * locale — useful during migrations when content lives at the root.
 */
export function getLocaleFromPost(entry: LocaleAwareEntry): string {
  if (entry.filePath) {
    const parts = entry.filePath.replace(/\\/g, "/").split("/");
    let sawCollectionDir = false;
    for (const part of parts) {
      if (sawCollectionDir) {
        // P1-7: skip `_`-prefixed segments BEFORE looking for a
        // locale so `posts/_drafts/en/foo.mdx` resolves to `en`.
        // Mirror of the `_`-strip loop in `deriveSlugFromFilePath`
        // (src/utils/contentSlug.ts).
        if (part.startsWith("_")) continue;
        if (isSupportedLocale(part)) return part;
        // First non-collection-dir, non-`_` segment isn't a locale → bail out.
        return DEFAULT_LOCALE;
      }
      if (COLLECTION_DIR_SET.has(part)) sawCollectionDir = true;
    }
  }

  const parts = entry.id.split("/");
  for (const part of parts) {
    // P1-7: id-based fallback also respects `_` segments.
    if (part.startsWith("_")) continue;
    if (isSupportedLocale(part)) return part;
  }
  return DEFAULT_LOCALE;
}
