import { LOCALES, isSupportedLocale } from "../i18n/locales";
import { getLocaleFromPost, type LocaleAwareEntry } from "./getLocaleFromPost";
import { slugifyStr } from "./slugify";

export type TagEntry = LocaleAwareEntry & {
  data: { tags: readonly string[] };
};

export function buildTagLocaleMap(
  entries: readonly TagEntry[]
): ReadonlyMap<string, readonly string[]> {
  const localesByTag = new Map<string, Set<string>>();
  for (const entry of entries) {
    const locale = getLocaleFromPost(entry);
    if (!isSupportedLocale(locale)) continue;
    for (const tag of entry.data.tags) {
      const slug = slugifyStr(tag);
      const locales = localesByTag.get(slug);
      if (locales) locales.add(locale);
      else localesByTag.set(slug, new Set([locale]));
    }
  }
  return new Map(
    [...localesByTag].map(([slug, locales]) => [
      slug,
      LOCALES.filter(locale => locales.has(locale)),
    ])
  );
}
