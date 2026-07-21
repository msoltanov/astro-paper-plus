import type { CollectionEntry } from "astro:content";
import {
  resolveContentSlug,
  normalizeSlugOverride,
  type CollectionDir,
} from "./contentSlug";
import { getContentUrl } from "./contentUrl";
import { LOCALES } from "../i18n/locales";
import { getLocaleFromPost } from "./getLocaleFromPost";

/**
 * Result of looking up every translation of a given content entry
 * (post, project, or gallery).
 *
 *   `availableLocales` — the locales for which a sibling exists.
 *     Drives the `og:locale:alternate` set in the entry's `<head>`
 *     and the items rendered by `LocaleSwitcher` (siblings not in
 *     the list are rendered disabled with a "not translated" hint).
 *
 *   `hrefByLocale` — every sibling's *actual* rendered URL, not the
 *     file-path-derived slug. The EN fork of `adding-new-post` ships
 *     under the override `adding-new-posts-in-astropaper-theme`; the
 *     `hrefByLocale.en` entry here is that override URL, so the
 *     locale switcher doesn't 404. Always includes the entry's own
 *     locale (mapped to its own URL) so callers can render the full
 *     set without re-merging.
 */
export interface ContentSiblings {
  availableLocales: readonly string[];
  hrefByLocale: Readonly<Record<string, string>>;
}

/**
 * Translation group for a single content collection. The outer key is
 * the entry's translation identity (locale-stripped file path BEFORE
 * any frontmatter `slug:` override), the inner map is locale → entry.
 *
 * Type parameter `C` is the literal collection name (`"posts"`,
 * `"projects"`, `"galleries"`). Picking the right type at the call
 * site means TS catches cross-collection mistakes (e.g. passing a
 * `CollectionEntry<"projects">` to a function that expects
 * `CollectionEntry<"posts">`).
 */
export type ContentTranslationGroups<C extends CollectionDir> = Map<
  string,
  Map<string, CollectionEntry<C>>
>;

/**
 * M16 (issues.md): the `data.slug` lookup was repeated on every
 * sibling with a `(entry.data as { slug?: unknown }).slug` cast that
 * existed for projects + galleries (whose schema doesn't declare
 * `slug`), but posts have it natively. Centralising the lookup here
 * means the cast lives in exactly one place, and the call sites
 * see a clean `string | null` return.
 */
function readSlugOverride(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const raw = (data as { slug?: unknown }).slug;
  return typeof raw === "string" ? normalizeSlugOverride(raw) : null;
}

/**
 * Build the sibling-lookup map for any content collection, keyed by
 * the translation identity. Siblings that share the same translation
 * key are linked together for hreflang and locale-switcher purposes.
 *
 * Mirrors the shape produced by
 * `src/utils/sitemap.ts#buildTranslationGroups` but operates on the
 * live `CollectionEntry<C>` values rather than the filesystem-only
 * `PostEntry` view the sitemap consumes (they can't share an
 * implementation because the sitemap integration runs after Vite has
 * torn down the `astro:content` virtual module runner).
 *
 * Locale derivation matches `getLocaleFromPost` so the per-locale
 * `hrefByLocale` URLs align with what the per-locale route emits.
 */
export function buildContentTranslationGroups<C extends CollectionDir>(
  collectionDir: C,
  entries: CollectionEntry<C>[]
): ContentTranslationGroups<C> {
  // The `collectionDir` parameter is currently used only as a
  // type witness (it constrains the generic `C`); the URL builder
  // it eventually feeds takes the same value as a runtime argument.
  // It's a parameter (rather than a return-type-only generic) so
  // call sites read `buildContentTranslationGroups("posts", …)`
  // — explicit beats clever.
  void collectionDir;
  const groups = new Map<string, Map<string, CollectionEntry<C>>>();
  for (const entry of entries) {
    // Translation key: locale-stripped file path BEFORE any
    // frontmatter `slug:` override. We pass `undefined` for the
    // override so the file-path-derived slug wins — siblings must
    // share the key even when their rendered URLs diverge.
    const key = resolveContentSlug(entry.id, entry.filePath);
    if (key === "/" || key === "") continue;
    const locale = getLocaleFromPost(entry);
    let inner = groups.get(key);
    if (!inner) {
      inner = new Map<string, CollectionEntry<C>>();
      groups.set(key, inner);
    }
    inner.set(locale, entry);
  }
  return groups;
}

/**
 * Resolve the sibling set for a single content entry. Returns the
 * locales that have a sibling AND each sibling's rendered URL
 * (including the entry's own locale, so callers don't need to
 * merge separately).
 */
export function findContentSiblings<C extends CollectionDir>(
  collectionDir: C,
  entry: CollectionEntry<C>,
  groups: ContentTranslationGroups<C>
): ContentSiblings {
  const key = resolveContentSlug(entry.id, entry.filePath);
  const group = groups.get(key);
  if (!group || group.size === 0) {
    // Untranslated entry — only the current locale exists. Return
    // just the current entry's own locale so `availableLocales`
    // stays truthful (not over-promising translations that don't
    // exist).
    const locale = getLocaleFromPost(entry);
    const override = readSlugOverride(entry.data);
    return {
      availableLocales: [locale],
      hrefByLocale: {
        [locale]: getContentUrl(
          collectionDir,
          entry.id,
          entry.filePath,
          locale,
          override
        ),
      },
    };
  }
  const hrefByLocale: Record<string, string> = {};
  const availableLocales: string[] = [];
  // Emit in deterministic LOCALES order — UI renders stably
  // regardless of Map iteration order.
  for (const locale of LOCALES) {
    const sib = group.get(locale);
    if (!sib) continue;
    availableLocales.push(locale);
    // Pass each sibling's own frontmatter slug override (when
    // present) so the URL builder emits its actual rendered path.
    // Without this the EN fork of `adding-new-post` (which ships
    // under the override `adding-new-posts-in-astropaper-theme`)
    // would resolve to the non-existent
    // `/posts/adding-new-post/`.
    const override = readSlugOverride(sib.data);
    hrefByLocale[locale] = getContentUrl(
      collectionDir,
      sib.id,
      sib.filePath,
      locale,
      override
    );
  }
  return { availableLocales, hrefByLocale };
}
