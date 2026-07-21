/**
 * Single source of truth for supported locales.
 *
 * Adding a new language? Update both this list, the language files under
 * `./lang/`, and the `i18n.locales` array in `astro.config.ts`.
 */

export const LOCALES = ["en", "ru", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_SET: ReadonlySet<string> = new Set<string>(LOCALES);

/** Native name for the language switcher / labels. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  tr: "Türkçe",
};

/**
 * Text direction per locale.
 *
 * Used by `Layout.astro` to set `<html dir>` dynamically — all current
 * locales are LTR, but the map unlocks RTL support (Arabic, Hebrew,
 * Persian, …) the moment a RTL locale is added. The existing
 * `rtl:` Tailwind variants throughout the templates become functional
 * without further change.
 */
export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ru: "ltr",
  tr: "ltr",
  // When adding an RTL locale, e.g. `ar: "rtl"`.
};

/**
 * Resolves the text direction for a locale code, falling back to "ltr"
 * for any input that isn't a recognised `Locale` (URL-typo guard).
 */
export function getLocaleDir(locale: string): "ltr" | "rtl" {
  return (LOCALE_DIR as Record<string, "ltr" | "rtl">)[locale] ?? "ltr";
}

const BCP47: Record<Locale, string> = {
  en: "en_US",
  ru: "ru_RU",
  tr: "tr_TR",
};

export function bcp47(locale: string): string {
  return (BCP47 as Record<string, string>)[locale] ?? locale;
}

/**
 * Returns true for supported locale codes (string-narrowed).
 */
export function isSupportedLocale(value: string): value is Locale {
  return LOCALE_SET.has(value);
}

/**
 * Narrows a string to `Locale` when supported; returns `undefined`
 * otherwise.
 */
export function asLocale(value: string): Locale | undefined {
  return isSupportedLocale(value) ? value : undefined;
}

/**
 * Resolve a locale from a URL prefix segment, returning undefined if not
 * a known locale. Replaces ad-hoc `/^[a-z]{2}$/` regexes across the
 * codebase with a single source of truth.
 */
export function localeFromUrlSegment(
  segment: string | undefined
): Locale | undefined {
  return segment && isSupportedLocale(segment) ? segment : undefined;
}

/**
 * Narrow a route `params.locale` (typed `string | undefined`) into a
 * supported `Locale`, falling back to `DEFAULT_LOCALE` if missing or
 * unrecognised. Centralises the cast that every `[locale]/...` route
 * previously hand-rolled with `Astro.params as unknown as { locale: string }`.
 *
 * Why this matters: `getStaticPaths` ensures every rendered URL has a
 * supported locale, so the fallback branch is purely defensive — for
 * example, if a future locale entry is added to `LOCALES` but the
 * router hasn't been updated, this function degrades to the default
 * locale rather than throwing.
 */
export function localeParam(value: string | undefined): Locale {
  return localeFromUrlSegment(value) ?? DEFAULT_LOCALE;
}
