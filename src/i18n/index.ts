import type { UIStrings } from "./types";
export { tplStr, formatDate, plural } from "./format";
export type { PluralForms } from "./format";
import {
  LOCALES as LOCALES_LIST,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  isSupportedLocale,
  asLocale,
} from "./locales";
import type { Locale } from "./locales";
// Re-export under the original name for downstream consumers that
// import `LOCALES` from `@/i18n`.
export { LOCALES_LIST as LOCALES };

const modules = import.meta.glob<{ default: UIStrings }>("./lang/*.ts", {
  eager: true,
});
const translations: Record<string, UIStrings> = {};
for (const [path, mod] of Object.entries(modules)) {
  const locale = path.slice("./lang/".length, -".ts".length);
  translations[locale] = mod.default;
}

/**
 * P2-37: assert at module load that every entry in `LOCALES` has a
 * corresponding `./lang/<locale>.ts` file. Without this check,
 * adding a locale to `LOCALES` without shipping the translation
 * file silently fell back to English at runtime — the published
 * site would render with mixed locales without any compile-time or
 * boot-time diagnostic.
 *
 * Throws during the module's eager evaluation (which Astro performs
 * while reading `astro.config.ts` via the `i18n` plugin graph), so
 * a missing translation file fails the build rather than the
 * production deploy.
 */
for (const locale of LOCALES_LIST) {
  if (!translations[locale]) {
    const file = `src/i18n/lang/${locale}.ts`;
    const found = Object.keys(translations).join(", ");
    throw new Error(
      `[i18n] LOCALES declares "${locale}" but ${file} is missing or failed to load. ` +
        `Found translations for: ${found}. Either add ${file} with a complete UIStrings ` +
        `object, or remove "${locale}" from LOCALES in src/i18n/locales.ts.`
    );
  }
}

/** Returns UI strings for the given locale, falling back to English.
 *
 * P2-36: when called with a locale that isn't a member of `LOCALES`
 * (e.g. `"trr"`, dynamic input from a URL), this used to
 * silently fall back to English with no diagnostic. We still
 * fall back (refusing to render English in that case would
 * crash every URL-typo page) but log a single warning in
 * development so contributors see the issue before shipping it.
 *
 * M — the empty-string and undefined paths no longer fall through
 * silently: `Astro.params.locale ?? DEFAULT_LOCALE` flows here as the
 * regular render path (no arg supplied, so `locale === undefined`),
 * but a caller that passes `""` (e.g. URL mishandling, a defaults
 * fall-through on a misconfigured environment) now gets the same
 * warn-once dev diagnostic instead of silently rendering English.
 * The truly-undefined case keeps its no-warning behaviour to avoid
 * spamming the dev console for every page that calls
 * `useTranslations()` without an arg.
 */
export function useTranslations(locale?: string): UIStrings {
  if (locale === undefined) return translations[DEFAULT_LOCALE];
  if (locale === "") {
    if (import.meta.env.DEV && !isWarnedUnknown("")) {
      warnedUnknownLocales.add("");
      // eslint-disable-next-line no-console
      console.warn(
        `[i18n] useTranslations("") → empty-string locale falling back to "${DEFAULT_LOCALE}". ` +
          `Most callers should pass \`Astro.params.locale ?? DEFAULT_LOCALE\` instead of ` +
          `an empty string — check the route's ` +
          `\`Astro.currentLocale\` resolution against the active i18n routing.`
      );
    }
    return translations[DEFAULT_LOCALE];
  }
  if (translations[locale]) return translations[locale];
  if (import.meta.env.DEV && !isWarnedUnknown(locale)) {
    warnedUnknownLocales.add(locale);
    // eslint-disable-next-line no-console
    console.warn(
      `[i18n] useTranslations("${locale}") → falling back to "${DEFAULT_LOCALE}". ` +
        `Add ${locale} to LOCALES (src/i18n/locales.ts) and ship a matching ` +
        `${`src/i18n/lang/${locale}.ts`} to silence this warning.`
    );
  }
  return translations[DEFAULT_LOCALE];
}

// Warn-once set. Avoids spamming the console when a single unknown
// locale string is rendered many times during dev (e.g. on every
// page during hot-reload).
const warnedUnknownLocales = new Set<string>();
function isWarnedUnknown(locale: string): boolean {
  return warnedUnknownLocales.has(locale);
}

// `LOCALE_LABELS`, `isSupportedLocale`, `asLocale`, and `DEFAULT_LOCALE`
// are re-exported here for the rest of the codebase; the explicit
// aliases are kept above the module body so the LOCALES-completeness
// check at load time has access to them. (Note: there is a small
// circular-import consideration if someone imports `LOCALE_LABELS`
// BEFORE the `translations` block runs — but `locales.ts` is a
// pure-constants file with no load-time side effects, so the
// runtime order is safe.)
export { LOCALE_LABELS, isSupportedLocale, asLocale };
export type { Locale };
export { DEFAULT_LOCALE };
