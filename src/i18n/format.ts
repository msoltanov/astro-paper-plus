/**
 * i18n formatting helpers.
 *
 * - `tplStr`   — replace `{{key}}` placeholders inside a UI string.
 * - `formatDate` — locale-aware date / time formatter built on
 *                  `Intl.DateTimeFormat`. The component never has to know
 *                  about dayjs, CLDR data, or plugin loading — it just
 *                  passes the user's `Intl.DateTimeFormatOptions` and the
 *                  active locale.
 * - `plural`   — pick the right plural form for a count using
 *                `Intl.PluralRules`. Lets translators provide the full
 *                CLDR plural-category set ("one" / "few" / "many" /
 *                "other") so e.g. Russian can ship "1 фотография /
 *                2 фотографии / 5 фотографий" without hand-rolled
 *                branching.
 *
 * Why a centralized helper instead of inline `Intl.DateTimeFormat`?
 * ---------------------------------------------------------------
 * - One place to catch errors / fall back gracefully.
 * - Components stop importing `dayjs` for formatting (we only need it for
 *   timezone *parsing* now — see `src/utils/parseDateInTz.ts`).
 * - Test surface stays small and predictable.
 */

/**
 * Replace `{{key}}` placeholders in UI strings.
 * Translators can reorder placeholders freely within the sentence.
 *
 * Missing or `null`/`undefined` values render as empty strings — keeps
 * partial substitutions from emitting literal `undefined` in the page.
 */
export function tplStr(
  template: string,
  vars: Record<string, string | number>
): string {
  // `[\w-]+` (instead of `\w+`) accepts dashes inside placeholder
  // names — translators sometimes write `{{user-name}}` or
  // `{{last-seen}}` for readability. The character class is bounded
  // (no dots, no whitespace, no JS metacharacters), so widening it
  // carries no injection risk.
  return template.replace(/\{\{([\w-]+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

/**
 * Format a `Date` (or anything `Intl.DateTimeFormat` accepts) for display
 * in the given locale using the supplied `Intl.DateTimeFormatOptions`.
 *
 * Locale resolution:
 * - Accepts any BCP-47 tag. Unknown tags gracefully degrade to
 *   `Intl.DateTimeFormat`'s own fallback (typically English).
 * - The supported locales (`en`, `ru`, `tr`) all ship CLDR
 *   data in modern Node / browser runtimes, so no extra locale loading
 *   is required.
 *
 * Errors:
 * - If `Intl.DateTimeFormat` throws on an exotic options combination,
 *   falls back to `Date.prototype.toString()` so the page never breaks.
 *
 * Timezone:
 * - When `timeZone` is supplied, it's passed through to `Intl.DateTimeFormat`
 *   so the rendered day matches the author's declared timezone, not the
 *   build server's. Undefined falls through to `Intl`'s default (runtime
 *   local zone).
 */
export function formatDate(
  date: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
  timeZone?: string
): string {
  const d = date instanceof Date ? date : new Date(date);
  try {
    const formatOptions: Intl.DateTimeFormatOptions = {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    };
    return new Intl.DateTimeFormat(locale, formatOptions).format(d);
  } catch {
    return d.toString();
  }
}

/**
 * CLDR plural categories. We expose them as a single map of templates so
 * translators only fill in the forms their language actually uses —
 * missing keys fall back to `other`.
 *
 * Examples:
 *   en: { one: "{{count}} photo", other: "{{count}} photos" }
 *   ru: {
 *     one:   "{{count}} фотография",
 *     few:   "{{count}} фотографии",
 *     many:  "{{count}} фотографий",
 *     other: "{{count}} фото",
 *   }
 */
export type PluralForms = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  /** Required — fallback for any category not explicitly listed. */
  other: string;
};

/**
 * Pick the right plural form for `count` in `locale` using
 * `Intl.PluralRules`, then run it through `tplStr` so `{{count}}` (or
 * any other variable the translator uses) gets substituted.
 *
 * Resolution order:
 *   1. The exact plural category returned by `Intl.PluralRules`.
 *   2. `other` — always required, always used as the final fallback.
 *
 * This deliberately never throws: a malformed `forms` object (missing
 * `other`) returns the count formatted with empty strings so the page
 * still renders something readable rather than blowing up the build.
 */
export function plural(
  locale: string,
  count: number,
  forms: PluralForms,
  vars: Record<string, string | number> = {}
): string {
  let category: Intl.LDMLPluralRule = "other";
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    // Unknown locale or runtime without full Intl support — fall through
    // to `other` so we still render *something*.
  }
  const template = forms[category] ?? forms.other ?? String(count);
  return tplStr(template, { ...vars, count });
}
