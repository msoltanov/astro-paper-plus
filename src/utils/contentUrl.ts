import { getRelativeLocaleUrl } from "astro:i18n";
import { slugSegmentsFromIdOrPath, type CollectionDir } from "./contentSlug";

/**
 * Build a fully-navigable, locale-relative URL for a content entry.
 *
 * Lives in its own module (not `contentSlug.ts`) because the
 * `astro:i18n` virtual module resolves only inside Astro's runtime —
 * tests import `contentSlug.ts` directly and would fail the resolver.
 * `contentSlug.ts` stays Astro-free; this thin wrapper layer adds the
 * i18n concern.
 */
export function getContentUrl(
  collectionDir: CollectionDir,
  id: string,
  filePath: string | undefined,
  locale: string,
  slugOverride?: unknown
): string {
  const segments = slugSegmentsFromIdOrPath(id, filePath, slugOverride);
  // `getRelativeLocaleUrl` joins with a leading slash and, for
  // directory-style paths (collection + segments), appends a
  // trailing slash so the URL resolves to
  // `dist/<locale>/<dir>/<segments>/index.html` rather than
  // `…/index.html` (which would 404). The test mock in
  // `src/__tests__/setup.ts` mirrors that trailing-slash shape
  // (pinned by `setup.test.ts`).
  return getRelativeLocaleUrl(locale, `${collectionDir}/${segments}`);
}
