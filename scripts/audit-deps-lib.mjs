/**
 * Pure helpers extracted from `scripts/audit-deps.mjs` so they're
 * unit-testable without booting the live osv.dev query path.
 *
 * The summarise step is split out because the script-level
 * regression tests can only exercise happy paths via `spawnSync` —
 * they can't force osv.dev to time out or 500 without a mock
 * layer. Splitting `summariseFindings` lets a vitest unit test
 * pin the "any UNKNOWN severity → fail closed" contract directly
 * over a synthetic `severityMap`, without going through HTTP at
 * all.
 */

/** Format a `pkg  [SEVERITY]  advisoryId` row for the log table. */
export function formatFinding(pkg, advisoryId, severity) {
  return `  - ${pkg}  [${severity}]  ${advisoryId}`;
}

/** Aggregate `findingsByKey` against `severityMap` into:
 *
 *   `failing`     — HIGH/CRITICAL findings to surface (exit 1).
 *   `unresolved`  — advisory lookups that returned UNKNOWN
 *                   severity, signalling a transient osv.dev
 *                   outage. The audit CANNOT claim clean because a
 *                   HIGH/CRITICAL could be hiding in there. Callers
 *                   must exit 2 (operational failure) when this is
 *                   non-empty.
 *                   UNKNOWN-METADATA (API reachable, but
 *                   `database_specific.severity` absent) is
 *                   recorded under `totalBySev` but does NOT cause
 *                   fail-closed — only a true fetch failure.
 *   `totalBySev`  — count-by-severity for the summary log.
 *
 * `SEVERITY_THRESHOLDS` is passed in (rather than imported from the
 * script) to keep this module free of module-level side effects. */
export function summariseFindings(findingsByKey, severityMap, severityThresholds) {
  const failing = [];
  const unresolved = [];
  const totalBySev = new Map();
  for (const [pkg, vulns] of findingsByKey.entries()) {
    for (const v of vulns) {
      const sev = severityMap.get(v.id) ?? "UNKNOWN";
      totalBySev.set(sev, (totalBySev.get(sev) ?? 0) + 1);
      if (sev === "UNKNOWN") unresolved.push({ pkg, id: v.id });
      if (severityThresholds.has(sev)) {
        failing.push(formatFinding(pkg, v.id, sev));
      }
    }
  }
  return { failing, unresolved, totalBySev };
}
