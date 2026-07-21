/**
 * Config-free kernel for `parseDateInTz`.
 *
 * Why this exists
 * ---------------
 * The Astro integration at `src/integrations/sitemap.ts` is loaded by
 * `astro.config.ts` at config-load time — BEFORE Vite's alias
 * resolver is up. The sitemap helpers therefore MUST NOT transitively
 * pull in `src/config.ts` (which itself imports `@/astro-paper.config`),
 * or `pnpm exec astro check` aborts with `Cannot find module
 * '@/astro-paper.config'` before any page is generated.
 *
 * This module is the safe, no-config surface that the sitemap (and
 * anything else loaded at config time) can depend on. The caller is
 * responsible for supplying a resolved `timezone` string — at the
 * sitemap integration boundary this is already pre-resolved to
 * `config.site.timezone ?? "UTC"` by `astro.config.ts` and threaded
 * in as `defaultTimezone`. The convenience wrapper `parseDateInTz`
 * in `src/utils/parseDateInTz.ts` keeps the optional-`timezone`
 * signature for routes/RSS/components that DO have access to the
 * resolved config.
 *
 * Input-type contract (#6)
 * ------------------------
 * `parseDateInTzCore` accepts both `string` (the common case —
 * frontmatter `pubDatetime: "…"` whose timezone is supplied by
 * the per-post `timezone:` field) and `Date` (the rare case —
 * YAML `!date`-tagged values, custom-collection flows, programmatic
 * callers). When the input is a `Date`, the timezone argument is
 * ignored because the value is already an absolute UTC instant; the
 * kernel surfaces the contract mismatch as a one-shot
 * `console.error` (deduplicated per `(value, timezone)` pair) so
 * contributors who passed a `Date` and relied on the per-post
 * `timezone:` field get a loud build-log breadcrumb. We chose
 * "loud log + dedup" rather than throwing because the schema layer
 * doesn't own the value type and several runtime paths inject
 * `Date` legitimately — turning the kernel into a build-fail gate
 * would lock a runtime contract behind a build-time check.
 */

import dayjs from "./dayjs";

/**
 * Matches strings that already carry an explicit timezone marker:
 * - trailing `Z` (UTC), e.g. "2025-07-15T10:30:00Z"
 * - explicit offset, e.g. "2025-07-15T10:30:00+07:00" or "2025-07-15T10:30:00-0500"
 *
 * Such strings are unambiguous — `new Date(str)` already returns the
 * correct absolute UTC instant regardless of the build machine's TZ.
 */
const EXPLICIT_TZ_RE = /[Zz]$|[+-]\d{2}:?\d{2}$/;

/**
 * Normalise a frontmatter string before any of the date-parsing
 * branches run. Two transforms matter:
 *   - `trim()` — leading/trailing whitespace in a YAML scalar is
 *     legal and common; `new Date(" 2025-07-15T10:30:00 ")` parses
 *     but `dayjs.tz(...)` is more lenient about whitespace and
 *     some downstream consumers (e.g. YAML dumpers in the
 *     integration pipeline) hand back values padded on either end.
 *   - `normalize("NFC")` — a frontmatter string with a decomposed
 *     glyph (U+0065 + U+0301 → `é`) parses to a different absolute
 *     instant than the precomposed form (U+00E9 → `é`) in some
 *     ICU / V8 combinations. The OG-input hash and the rest of
 *     the codebase normalise to NFC, so the date parser should
 *     too — otherwise two builds of the same post produce
 *     different `<lastmod>` values.
 *
 * Exported so tests can pin the normalisation contract without
 * round-tripping through the parse branches (which throw on
 * noise-suffixed inputs that we mostly care about here).
 */
export function normalizeDateString(value: string): string {
  return value.trim().normalize("NFC");
}

/** Warn-once set for the Date-instance + timezone argument case.
 * Tests and routes call `parseDateInTz(post.data.pubDatetime,
 * post.data.timezone)`; if `pubDatetime` is already a `Date` (e.g.
 * from a collection that loaded a YAML `!date` tag — see the
 * `content.config.ts` schema note), the timezone argument is
 * silently ignored. The runtime behaviour is correct (a `Date` is
 * already absolute), but the API is misleading: a contributor who
 * sees the helper called with `timezone: "Asia/Karachi"` reasonably
 * expects the date to be interpreted in that timezone. We surface
 * the inconsistency in dev once per unique input shape so the bug
 * becomes visible without spamming the build log.
/**
 * Dev-mode dedup set for the "Date argument bypasses timezone" warning.
 *
 * T3-5: the previous shape grew unboundedly across the lifetime of
 * a process. In a long-running SSR runtime that re-parses many
 * posts (server islands, paginated archives fetches, etc.) the set
 * can accumulate a unique entry per (value, timezone) pair, which
 * is a memory-DoS surface: an attacker who controls frontmatter
 * content can emit a unique `pubDatetime` per request and grow the
 * set without bound. The cap below drops oldest entries once the
 * threshold is crossed, bounding the dedup table's memory footprint
 * while preserving "warn once per build" semantics for the common
 * case (a handful of frontmatter date shapes).
 *
 * The cap is chosen to be generous — 1024 distinct (value,
 * timezone) pairs is many thousands of posts worth of unique
 * dates, well past anything a realistic blog would emit. A
 * contributor who needs the `Set` to grow further can change the
 * constant without code-shape changes elsewhere.
 */
const WARNED_PAIRS_MAX = 1024;
const warnedDateTimezonePairs = new Set<string>();

/**
 * Resolves a `pubDatetime` / `modDatetime` value (string or Date) into
 * an absolute UTC `Date`, honoring the supplied `timezone` when the
 * input is a string that lacks an explicit timezone marker.
 *
 * Behavior
 * --------
 * - `Date` instance → returned as-is (already absolute). The
 *   `timezone` argument is meaningless in this branch (a `Date`
 *   is purely an absolute UTC ms timestamp); M logs a one-shot
 *   dev-mode warning so contributors who intended a timezone
 *   interpretation can spot the contract mismatch.
 * - String with TZ marker → parsed via `new Date(str)`, unambiguous.
 *   Validated; malformed inputs like `not-a-dateZ` rethrow as
 *   `RangeError` (same loud-fail contract as the other branches).
 * - String without TZ marker → parsed as a wall-clock value in
 *   `timezone` via `dayjs.tz()`. Invalid timezone name → falls back
 *   to `new Date(value)` (host TZ). The fallback is validated; a
 *   genuinely unparseable value rethrows as `RangeError`.
 *
 * `timezone` is required (no default lookup) so this helper has no
 * dependency on `src/config.ts` and is safe to import from modules
 * that run during Astro's config-load phase.
 */
export function parseDateInTzCore(
  value: string | Date,
  timezone: string
): Date {
  if (value instanceof Date) {
    // #6 COR — a `Date` instance is absolute (already pinned to
    // a UTC moment) so the `timezone` argument cannot be applied.
    // T2-6: previously logged at `console.error`, which caused
    // production log monitoring (Sentry, Datadog, etc.) to fire
    // on-call for what is actually a documented, expected, and
    // deduped diagnostic. The contract is "warn-once dev
    // diagnostic" — `console.warn` matches the intent. The dedup
    // set keeps the noise bounded — one message per unique (value,
    // timezone) pair for the duration of the build. Runtime
    // behaviour is unchanged (the Date IS the correct absolute UTC
    // instant — frontmatter authors who wanted a per-post
    // `timezone:` field must use a STRING pubDatetime, not a
    // `!date`-tagged YAML value). Documented approach: log loudly
    // + dedup, NOT schema rejection, because the schema layer
    // doesn't own the value type (some frontmatter paths inject
    // `Date` via custom collections) and throwing at this layer
    // would lock a runtime contract behind a build-time check.
    const key = `${value.toISOString()}|${timezone}`;
    if (!warnedDateTimezonePairs.has(key)) {
      // T3-5: bound the dedup table so a long-running SSR runtime
      // with attacker-controlled frontmatter (per-request unique
      // pubDatetime strings) can't grow this `Set` unboundedly. FIFO
      // drop: once the cap is hit, the oldest entry is removed
      // before adding the new one. The cap is generous (1024) so
      // dropping an old entry only affects logs in the unusual case
      // where the same Date appears across thousands of unrelated
      // requests — at which point warning again is fine.
      if (warnedDateTimezonePairs.size >= WARNED_PAIRS_MAX) {
        const oldest = warnedDateTimezonePairs.values().next().value;
        if (oldest !== undefined) warnedDateTimezonePairs.delete(oldest);
      }
      warnedDateTimezonePairs.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `[parseDateInTzCore] Date argument bypasses timezone=${JSON.stringify(timezone)}; ` +
          `result is treated as absolute UTC. Per-post timezone fields only apply ` +
          `to STRING pubDatetime values (frontmatter without a ` +
          `trailing TZ marker).`
      );
    }
    return value;
  }
  // M — NFC-normalise + trim the frontmatter string before any of
  // the parsing branches run. See `normalizeDateString` for the
  // full rationale (cross-platform date reproducibility).
  const normalised = normalizeDateString(value);
  if (EXPLICIT_TZ_RE.test(normalised)) {
    // `EXPLICIT_TZ_RE` matches the trailing marker, not the rest of
    // the string — so `not-a-dateZ` or `2025-01-01T99:00:00Z` slip
    // through here and `new Date(value)` returns Invalid Date. Validate
    // so the same loud-fail contract holds across all three branches.
    const parsed = new Date(normalised);
    if (Number.isNaN(parsed.getTime())) {
      throw new RangeError(
        `parseDateInTzCore: unable to parse ${JSON.stringify(value)} as a date (explicit timezone marker)`
      );
    }
    return parsed;
  }
  try {
    // P2-4: validate the dayjs.tz branch's `Date` is not the
    // Invalid Date sentinel. The other two branches check
    // `Number.isNaN(parsed.getTime())`; this branch slipped through
    // because `dayjs.tz(value, timezone)` itself never throws — it
    // returns a Day.js "Invalid Date" object whose `.toDate()`
    // resolves to `new Date(NaN)`. A `getSortedPosts` sort against a
    // NaN timestamp yields `undefined` and silently corrupts the
    // listing order. Mirror the other branches' loud-fail contract.
    const tzDate = dayjs.tz(normalised, timezone).toDate();
    if (Number.isNaN(tzDate.getTime())) {
      throw new RangeError(
        `parseDateInTzCore: dayjs.tz rejected ${JSON.stringify(value)} (timezone=${JSON.stringify(timezone)})`
      );
    }
    return tzDate;
  } catch (err) {
    // L16: surface a developer-only breadcrumb before the silent
    // fallback runs. The original dayjs error message is dropped by
    // a bare `catch {}` — bad-timezone debugging without it is just
    // guessing. Production builds don't see this; dev sessions get
    // a clear pointer to the offending value.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        `[parseDateInTzCore] dayjs.tz failed for ${JSON.stringify(value)} (timezone=${JSON.stringify(timezone)})`,
        err instanceof Error ? err.message : err
      );
    }
    // Invalid timezone name. Fall back to `new Date(value)` so the
    // build keeps going, but only if the value itself is parseable —
    // otherwise rethrow so the bad frontmatter fails loud at build
    // time rather than silently dropping the entry or throwing later
    // from `.toISOString()` on an Invalid Date. Use the NFC-normalised
    // string here too so the fallback path doesn't drift from the
    // primary path on a decomposed-glyph input.
    const fallback = new Date(normalised);
    if (Number.isNaN(fallback.getTime())) {
      throw new RangeError(
        `parseDateInTzCore: unable to parse ${JSON.stringify(value)} as a date (timezone=${JSON.stringify(timezone)})`
      );
    }
    return fallback;
  }
}

/** Test-only escape hatch. Vitest exercises the Date-instance +
 * timezone warn-once path through repeated calls in a single case;
 * without an explicit reset, the second call would suppress the
 * warning and hide a regression.
 */
export function __resetParseDateInTzWarningsForTesting(): void {
  warnedDateTimezonePairs.clear();
}
