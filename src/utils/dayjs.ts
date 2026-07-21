/**
 * Shared dayjs instance with every plugin this repo needs already
 * extended. Importing this module instead of the bare `dayjs` package
 * guarantees:
 *
 *   1. The `utc` and `timezone` plugins are registered exactly once.
 *      `dayjs.extend(...)` is idempotent at runtime (the plugin
 *      dedupes), but having two call sites means a future
 *      `dayjs.extend(relativeTime)` (or similar) must be remembered
 *      in N places. The single-source-of-truth here keeps that
 *      foot-gun pointed at one file.
 *   2. New dayjs plugins MUST be added here, not at the call site —
 *      the comment block below is the audit trail.
 *
 * Plain `import dayjs from "dayjs"` still works for code paths that
 * don't touch `dayjs.tz` / `dayjs.utc`, but parsing timezones without
 * these plugins throws a runtime error.
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// New dayjs plugins MUST be extended in this file. Past extensions:
//   - utc      — parses trailing-Z strings, anchors Date math in UTC.
//   - timezone — `dayjs.tz(str, "Asia/Ashgabat")` for wall-clock parsing.

export default dayjs;
