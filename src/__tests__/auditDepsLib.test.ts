import { describe, it, expect } from "vitest";
import {
  summariseFindings,
  formatFinding,
} from "../../scripts/audit-deps-lib.mjs";

/**
 * Unit tests for the lib extracted from `audit-deps.mjs`. The
 * script tests pin parser + production-graph scoping; this module
 * pins the severity-summary / fail-closed contract that the script
 * relies on at exit-time.
 */

const THRESHOLDS = new Set(["HIGH", "CRITICAL"]);

describe("audit-deps-lib — formatFinding", () => {
  it("renders the same shape the script's table expects", () => {
    expect(formatFinding("foo@1.0.0", "GHSA-xxxx-yyyy-zzzz", "HIGH")).toBe(
      "  - foo@1.0.0  [HIGH]  GHSA-xxxx-yyyy-zzzz"
    );
  });
});

describe("audit-deps-lib — summariseFindings (fail-closed on UNKNOWN)", () => {
  it("returns no failing or unresolved when severity map covers every advisory", () => {
    const findingsByKey = new Map([
      ["foo@1.0.0", [{ id: "GHSA-aaaa-bbbb-cccc" }]],
    ]);
    const severityMap = new Map([["GHSA-aaaa-bbbb-cccc", "LOW"]]);
    const result = summariseFindings(findingsByKey, severityMap, THRESHOLDS);
    expect(result.failing).toEqual([]);
    expect(result.unresolved).toEqual([]);
    expect(result.totalBySev.get("LOW")).toBe(1);
  });

  it("flags HIGH and CRITICAL severities as failing", () => {
    const findingsByKey = new Map([
      ["foo@1.0.0", [{ id: "GHSA-h1" }, { id: "GHSA-c1" }]],
      ["bar@2.0.0", [{ id: "GHSA-m1" }]],
    ]);
    const severityMap = new Map([
      ["GHSA-h1", "HIGH"],
      ["GHSA-c1", "CRITICAL"],
      ["GHSA-m1", "MEDIUM"],
    ]);
    const result = summariseFindings(findingsByKey, severityMap, THRESHOLDS);
    expect(result.failing).toHaveLength(2);
    expect(result.failing[0]).toContain("foo@1.0.0");
    expect(result.failing[0]).toContain("GHSA-h1");
    expect(result.failing[0]).toContain("[HIGH]");
    expect(result.failing[1]).toContain("[CRITICAL]");
    // MEDIUM is informational, not failing.
    expect(result.unresolved).toEqual([]);
    expect(result.totalBySev.get("HIGH")).toBe(1);
    expect(result.totalBySev.get("CRITICAL")).toBe(1);
    expect(result.totalBySev.get("MEDIUM")).toBe(1);
  });

  it("fail-closed: an UNKNOWN severity is recorded as unresolved (drives main() exit 2)", () => {
    // Simulates a transient osv.dev outage — `fetchSeverityMap` recorded
    // "UNKNOWN" for an advisory whose individual GET timed out. Without
    // the fail-closed guard, this advisory would silently drop out of
    // `failing` and the build would pass with exit 0 even though the
    // audit is incomplete.
    const findingsByKey = new Map([
      ["foo@1.0.0", [{ id: "GHSA-unresolved" }]],
      ["bar@1.0.0", [{ id: "GHSA-low" }]],
    ]);
    const severityMap = new Map([
      ["GHSA-unresolved", "UNKNOWN"],
      ["GHSA-low", "LOW"],
    ]);
    const result = summariseFindings(findingsByKey, severityMap, THRESHOLDS);
    expect(result.failing).toEqual([]);
    expect(result.unresolved).toEqual([
      { pkg: "foo@1.0.0", id: "GHSA-unresolved" },
    ]);
    expect(result.totalBySev.get("UNKNOWN")).toBe(1);
  });

  it("UNKNOWN severity is reported EVEN when present alongside HIGH findings (not suppressed)", () => {
    // Both unresolved and HIGH/CRITICAL findings should surface.
    // The script's fail-closed guard runs FIRST in main() — but
    // summariseFindings should still record both correctly.
    const findingsByKey = new Map([
      ["foo@1.0.0", [{ id: "GHSA-h" }, { id: "GHSA-u" }]],
    ]);
    const severityMap = new Map([
      ["GHSA-h", "HIGH"],
      ["GHSA-u", "UNKNOWN"],
    ]);
    const result = summariseFindings(findingsByKey, severityMap, THRESHOLDS);
    expect(result.failing).toHaveLength(1);
    expect(result.unresolved).toHaveLength(1);
    expect(result.totalBySev.get("HIGH")).toBe(1);
    expect(result.totalBySev.get("UNKNOWN")).toBe(1);
  });

  it("treats an absent advisory id as UNKNOWN (severityMap.has() guard)", () => {
    // Defensive: if `fetchSeverityMap` ever produced a partial map
    // (a bug we don't currently have, but might under a future
    // upstream API change), `get(v.id) ?? "UNKNOWN"` should still
    // trip the fail-closed path.
    const findingsByKey = new Map([["foo@1.0.0", [{ id: "GHSA-missing" }]]]);
    const severityMap = new Map(); // empty
    const result = summariseFindings(findingsByKey, severityMap, THRESHOLDS);
    expect(result.failing).toEqual([]);
    expect(result.unresolved).toEqual([
      { pkg: "foo@1.0.0", id: "GHSA-missing" },
    ]);
    expect(result.totalBySev.get("UNKNOWN")).toBe(1);
  });
});
