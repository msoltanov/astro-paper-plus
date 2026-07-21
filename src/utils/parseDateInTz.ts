import { parseDateInTzCore } from "./parseDateInTzCore";
import config from "../config";

/**
 * Convenience wrapper around `parseDateInTzCore` that resolves the
 * site-wide default timezone from `config.site.timezone` when the
 * caller does not supply one.
 *
 * This module is intentionally NOT safe to import from the Astro
 * config-load phase (it depends on `src/config.ts`, which in turn
 * pulls in `@/astro-paper.config` — an alias Astro's loader can't
 * resolve until Vite is up). Anything that runs at config-load time
 * (e.g. `src/integrations/sitemap.ts` and its helpers) must depend
 * on `parseDateInTzCore` instead, passing in a pre-resolved timezone.
 *
 * Why this exists
 * ---------------
 * `z.date()` in the frontmatter schema coerces strings via `new Date(str)`,
 * and JavaScript interprets strings without an explicit offset in the
 * **build machine's local timezone**. The same frontmatter value therefore
 * resolves to different UTC instants depending on where the build runs:
 *
 *   TZ=UTC          new Date("2025-07-15T10:30:00") → 1752575400000
 *   TZ=Asia/Bangkok new Date("2025-07-15T10:30:00") → 1752557400000
 *
 * `postFilter` then compared `Date.now()` against this machine-local
 * parsed ms, so the same post could pass or fail scheduling depending
 * purely on the build environment. This helper normalizes ambiguous
 * strings to the resolved timezone, giving reproducible behavior across
 * environments.
 *
 * Behavior
 * --------
 * - `Date` instance → returned as-is (already absolute).
 * - String with TZ marker → parsed via `new Date(str)`, unambiguous.
 *   Validated; malformed inputs rethrow as `RangeError`.
 * - String without TZ marker → parsed as a wall-clock value in
 *   `timezone ?? config.site.timezone` via `dayjs.tz()`.
 * - Per-post `timezone` (when supplied) overrides the site-wide default.
 * - Invalid timezone name → fallback to `new Date(value)` (host TZ)
 *   so a single typo doesn't kill the build. The fallback is validated;
 *   a genuinely unparseable value rethrows as `RangeError`.
 *
 * The author can still write explicit offsets (`+07:00` / `Z`) for an
 * individual post — those are respected as-is.
 */
export function parseDateInTz(value: string | Date, timezone?: string): Date {
  return parseDateInTzCore(value, timezone ?? config.site.timezone);
}

/**
 * Same as `parseDateInTz` but returns the absolute UTC millisecond
 * timestamp directly — handy for hot-path comparisons.
 */
export function parseDateInTzMs(
  value: string | Date,
  timezone?: string
): number {
  return parseDateInTz(value, timezone).getTime();
}
