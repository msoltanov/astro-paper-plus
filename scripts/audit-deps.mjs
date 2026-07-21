#!/usr/bin/env node
/**
 * `audit-deps.mjs` — dependency vulnerability scan via osv.dev.
 *
 * Why this exists
 * ---------------
 * `pnpm audit` hits the npm `/-/npm/v1/security/audits` endpoint,
 * which was retired (HTTP 410) in favour of the bulk-advisory
 * endpoint. pnpm 10.x hasn't migrated yet, so every CI run was
 * failing with `ERR_PNPM_AUDIT_BAD_RESPONSE` and the audit leg
 * was a no-op (`--ignore-registry-errors` made it exit 0
 * silently). This script queries Google's Open Source
 * Vulnerabilities database (osv.dev) directly via its bulk-query
 * API, which mirrors the npm advisory data without needing a
 * package-lock.json.
 *
 * Scope — production graph only
 * -----------------------------
 * This script audits ONLY the production dependency graph, the
 * way `pnpm audit --prod` used to. CI documents a production-only
 * audit gate, and an eslint/vitest/build-tooling advisory should
 * not block a production deploy. We walk the lockfile's
 * `importers.[.].dependencies` (skipping `devDependencies`)
 * transitively through `snapshots.[name@version].dependencies`
 * + `.optionalDependencies`, then audit every `packages:` entry
 * whose name is reachable from that closure. Platform-specific
 * optional binaries of production packages (e.g.
 * `@astrojs/compiler-binding-darwin-arm64`) ARE included because
 * they ship with prod builds.
 *
 * If the lockfile is missing an `importers:` block (older format
 * or synthetic fixture), we fall back to auditing every entry in
 * `packages:` — never silently miss advisories just because the
 * production-graph walker couldn't run.
 *
 * Behaviour
 * ---------
 * 1. Parse `pnpm-lock.yaml` — extract every `packages:` entry as
 *    `{ name, version }` AND walk the production closure from
 *    `importers.[.].dependencies`.
 * 2. Filter `packages:` to the production closure.
 * 3. POST a batch of up to 100 queries to
 *    `https://api.osv.dev/v1/querybatch` (the bulk endpoint; 100 is
 *    the documented soft cap).
 * 4. Filter advisories to severity "HIGH" or "CRITICAL". Anything
 *    else is logged at info-level but does NOT fail the build
 *    (matches the `pnpm audit --audit-level=high` contract we had
 *    before the endpoint broke).
 * 5. Fail CLOSED when severity lookups resolve to UNKNOWN. If any
 *    per-advisory GET fails (timeout / 404 / 5xx after retries /
 *    rate-limit) `fetchSeverityMap` records "UNKNOWN" and main()
 *    exits 2 — we can NOT claim the audit is clean when ANY
 *    advisory is unaccounted for, because a HIGH/CRITICAL could
 *    be hiding behind the unresolved fetch. The script must NOT
 *    pass on partial failure.
 * 6. Print a one-line summary + a per-advisory table. Exit non-zero
 *    on findings so CI fails loud.
 *
 * Why osv.dev and not npm-audit
 * -----------------------------
 * - osv.dev doesn't require a package-lock.json (the bulk endpoint
 *   accepts a list of `{package, version}` tuples).
 * - osv.dev data is sourced from GHSA + NVD + others, and the npm
 *   bulk advisory endpoint itself consumes the same upstream feed.
 * - No auth needed for the public bulk-query endpoint.
 *
 * Exit codes
 * ----------
 *   0 — clean (no high/critical findings)
 *   1 — one or more high/critical findings
 *   2 — operational failure (network, parse error)
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { summariseFindings, formatFinding } from "./audit-deps-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCKFILE = process.env.AUDIT_DEPS_LOCKFILE
  ? resolve(process.env.AUDIT_DEPS_LOCKFILE)
  : resolve(HERE, "..", "pnpm-lock.yaml");
const OSV_BULK = "https://api.osv.dev/v1/querybatch";
const OSV_GET = "https://api.osv.dev/v1/vulns/";
const BATCH_SIZE = 100;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;

const SEVERITY_THRESHOLDS = new Set(["HIGH", "CRITICAL"]);

/**
 * Split a pnpm-lock key (`name@version` or `@scope/name@version`,
 * optionally followed by `(peer-hash)` or `/peer-hash`) into its
 * `{ name, version }` parts. Returns `null` if the key doesn't
 * match the expected shape.
 *
 * Why we can't just use `lastIndexOf('@')`:
 * -----------------------------------------
 * Peer-dep hashes can contain `@` (a typical hash is
 * `(name@version)(name@version)`). The LAST `@` in such a key
 * sits inside the hash, not at the name/version boundary, so
 * `lastIndexOf` produces a name like
 * `astro@7.0.7(@astrojs/markdown-remark@7.2.1)(yaml` — wrong.
 *
 * The correct split:
 *   - Scoped names start with `@`; the boundary is the SECOND `@`.
 *   - Unscoped names use the FIRST (and only) `@`.
 *   - Then strip the peer-hash suffix from the version (anything
 *     from the first `(` or `/` onward).
 */
function splitPackageKey(rawKey) {
  let key = rawKey;
  // Strip surrounding quotes pnpm uses for keys containing `@` /
  // `/` / `.` (which is every scoped or dotted package).
  if ((key.startsWith("'") && key.endsWith("'")) ||
      (key.startsWith("\"") && key.endsWith("\""))) {
    key = key.slice(1, -1);
  }
  const at = key.startsWith("@") ? key.indexOf("@", 1) : key.indexOf("@");
  if (at <= 0) return null;
  const name = key.slice(0, at);
  let version = key.slice(at + 1);
  const versionTail = version.search(/[(\/]/);
  if (versionTail >= 0) version = version.slice(0, versionTail);
  if (!name || !version) return null;
  return { name, version };
}

/**
 * Parse `pnpm-lock.yaml` and return one entry per installed package.
 * Each entry is `{ name, version }` extracted from a `packages:`
 * block key.
 *
 * Examples of keys we parse:
 *   '@antfu/install-pkg@1.1.0'
 *   'lodash.kebabcase@4.1.1'
 *   'astro@7.0.7(@astrojs/...)'  ← with peer dep hash — version
 *     ends at the first `(` if present.
 */
const SUPPORTED_LOCKFILE_VERSIONS = new Set(["6.0", "9.0", 6, 9]);

function readLockfilePackages(lockPath) {
  const raw = readFileSync(lockPath, "utf8");
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || !parsed.packages) {
    throw new Error(
      `[audit-deps] could not parse lockfile at ${lockPath} — missing 'packages' block.`,
    );
  }
  if (
    parsed.lockfileVersion !== undefined &&
    !SUPPORTED_LOCKFILE_VERSIONS.has(parsed.lockfileVersion)
  ) {
    throw new Error(
      `[audit-deps] unsupported lockfileVersion '${parsed.lockfileVersion}' — ` +
        "the audit script doesn't understand this lockfile format and won't silently walk it. " +
        `Add it to SUPPORTED_LOCKFILE_VERSIONS after confirming the shape matches.`,
    );
  }
  const entries = [];
  for (const rawKey of Object.keys(parsed.packages)) {
    const split = splitPackageKey(rawKey);
    if (!split) continue;
    // Path-deps (file:/link:) have a version that starts with `file:`
    // or `link:` — osv.dev doesn't index those, so skip.
    if (split.version.startsWith("file:") || split.version.startsWith("link:")) continue;
    entries.push(split);
  }
  return entries;
}

/**
 * Strip a peer-suffix or hoisted-suffix from a pnpm `version`
 * string. The string is either a plain version ("7.0.7") or
 * "version(peer1)(peer2)" with the resolved version in the
 * leading token. We need this for both importer `version` fields
 * and `snapshots[*].dependencies[depName]` values — pnpm emits
 * the same shape in both, and in both cases the resolved version
 * is what we want to pin in the prod-closure set.
 */
function peerlessVersion(rawVersion) {
  if (typeof rawVersion !== "string") return null;
  const trimmed = rawVersion.trim();
  if (!trimmed) return null;
  const tail = trimmed.search(/[(\/]/);
  const ver = tail >= 0 ? trimmed.slice(0, tail) : trimmed;
  return ver || null;
}

/**
 * Walk the lockfile's production dependency closure from
 * `importers.[.].dependencies` through `snapshots[name@version].dependencies`
 * + `.optionalDependencies`. Returns `{names, versions}`:
 *
 *   `names`    — every package name reachable from the prod graph.
 *   `versions` — every (name, version) tuple pinned along the way.
 *
 * The version set drives the production-only filter in `main()`
 * so a dev-only `foo@0.5.0` doesn't get audited as production
 * just because the prod graph reaches a different `foo@1.0.0`.
 * `names` is kept alongside it for the `skipped`-count log
 * message and to enable a tightened name-only fallback for
 * lockfiles that don't pin a resolved version per dep.
 *
 * Returns `null` if the lockfile doesn't have a parseable
 * `importers.[.]` block — callers should fall back to auditing
 * every `packages:` entry in that case so an older/synthetic
 * lockfile never silently misses advisories.
 */
function readProductionPackageScopes(lockPath) {
  const raw = readFileSync(lockPath, "utf8");
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`[audit-deps] could not parse lockfile at ${lockPath}.`);
  }
  const importer = parsed.importers?.["."];
  if (!importer || typeof importer !== "object") return null;
  const prodDeps = importer.dependencies;
  if (!prodDeps || typeof prodDeps !== "object") return null;
  const snapshots = parsed.snapshots;
  if (!snapshots || typeof snapshots !== "object") return null;

  // Build a `name → [{split, snapshot}]` index. Each snapshot is
  // keyed by its full `name@version(peer-suffix)` string; multiple
  // variants can exist for the same name+version when peer-dep
  // resolution differs. We index every variant so the walker can
  // narrow to the specific `(name, version)` of a transitive dep
  // when the closure has pinned it (driven by the importer or a
  // parent's `snapshots[*].dependencies` map).
  const snapshotsByName = new Map();
  for (const key of Object.keys(snapshots)) {
    const split = splitPackageKey(key);
    if (!split) continue;
    let arr = snapshotsByName.get(split.name);
    if (!arr) {
      arr = [];
      snapshotsByName.set(split.name, arr);
    }
    arr.push({ split, snapshot: snapshots[key] });
  }

  const reachableNames = new Set();
  const reachableVersions = new Set();
  const queue = [];
  for (const [name, dep] of Object.entries(prodDeps)) {
    reachableNames.add(name);
    const directVer = peerlessVersion(dep?.version);
    if (directVer) reachableVersions.add(`${name}@${directVer}`);
    queue.push({ name, version: directVer });
  }

  const visited = new Set();
  while (queue.length > 0) {
    const { name, version } = queue.shift();
    const visitKey = version ? `${name}@${version}` : name;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    const variants = snapshotsByName.get(name);
    if (!variants) continue;
    for (const { split, snapshot } of variants) {
      if (version && split.version !== version) continue;
      const nv = `${split.name}@${split.version}`;
      reachableVersions.add(nv);
      if (!snapshot || typeof snapshot !== "object") continue;
      const sources = [snapshot.dependencies, snapshot.optionalDependencies];
      for (const deps of sources) {
        if (!deps || typeof deps !== "object") continue;
        for (const [depName, depVer] of Object.entries(deps)) {
          reachableNames.add(depName);
          // depVer is a resolved version string ("4.2.0"), rarely
          // with peer-suffix on transitive optionals. Pin the
          // exact tuple so the consumer filter can drop dev-only
          // duplicates.
          const ver = peerlessVersion(depVer);
          const childKey = ver ? `${depName}@${ver}` : depName;
          if (!visited.has(childKey)) queue.push({ name: depName, version: ver });
        }
      }
    }
  }
  return { names: reachableNames, versions: reachableVersions };
}

/**
 * True iff another (name, otherVersion) tuple is already pinned in
 * the closure's `versions` set. Used by `main()` to decide whether
 * the name-only fallback is safe — when SOME version of a name is
 * pinned, falling back to "audit every version of this name"
 * would re-introduce the dev-only-over-scoped bug this whole
 * module was restructured to fix.
 */
function hasOtherPinnedNameVersion(versions, name, skipVersion) {
  for (const nv of versions) {
    if (nv === skipVersion) continue;
    if (nv.startsWith(`${name}@`)) return true;
  }
  return false;
}

/** Fetch with retry on transient network errors / 5xx. */
async function fetchJson(url, init, label) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return await res.json();
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`${label} HTTP ${res.status}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      throw new Error(`${label} HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastErr;
}

/** Submit a batch of package queries and return findings keyed by
 *  `${name}@${version}`. Findings is `advisories[]` — empty array
 *  if osv has nothing on that package+version. */
async function queryBatch(packages) {
  const out = new Map();
  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const slice = packages.slice(i, i + BATCH_SIZE);
    const body = JSON.stringify({
      queries: slice.map(p => ({
        package: { name: p.name, ecosystem: "npm" },
        version: p.version,
      })),
    });
    const data = await fetchJson(
      OSV_BULK,
      { method: "POST", headers: { "content-type": "application/json" }, body },
      `osv.dev batch @${i}`,
    );
    data.results.forEach((r, idx) => {
      const key = `${slice[idx].name}@${slice[idx].version}`;
      out.set(key, r.vulns ?? []);
    });
  }
  return out;
}

/** Fetch the full advisory document to pull severity. osv.dev's
 *  bulk endpoint only returns IDs, so we need a second round-trip
 *  to read the `database_specific.severity` field. We parallelise
 *  with a small concurrency cap to stay polite. */
async function fetchSeverityMap(advisoryIds) {
  const out = new Map();
  const uniq = [...new Set(advisoryIds)];
  let i = 0;
  const concurrency = 8;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < uniq.length) {
      const id = uniq[i++];
      try {
        const doc = await fetchJson(OSV_GET + encodeURIComponent(id), {}, id);
        const sev = doc?.database_specific?.severity;
        out.set(id, typeof sev === "string" ? sev : "UNKNOWN-METADATA");
      } catch {
        out.set(id, "UNKNOWN");
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const allPackages = readLockfilePackages(LOCKFILE);
  if (allPackages.length === 0) {
    console.log("[audit-deps] no packages parsed from lockfile — nothing to do.");
    return;
  }
  // Filter to the production dependency graph (mirrors the
  // `pnpm audit --prod` scope CI used to rely on). Dev tooling
  // vulnerabilities must not block a production build.
  const prodScope = readProductionPackageScopes(LOCKFILE);
  let packages;
  let scopeNote;
  if (prodScope === null) {
    // Older / synthetic lockfile without a parseable
    // `importers.[.]` block — fall back to auditing every entry
    // rather than silently missing advisories.
    packages = allPackages;
    scopeNote = "all lockfile entries (no importers block to scope from)";
  } else {
    // Audit a (name, version) tuple when:
    //   (a) the closure pinned it via the importer or a parent's
    //       `snapshots[*].dependencies` map, OR
    //   (b) the name is reachable but no version was pinned (e.g.
    //       an older fixture without resolved `version` fields) AND
    //       no OTHER version of this name was pinned — so the
    //       version-blind fallback is unambiguous. Otherwise we'd
    //       re-introduce the dev-only-over-scoped regression
    //       (`foo@0.5.0` failing a prod-only gate because the prod
    //       graph resolves `foo` to `1.0.0`).
    packages = allPackages.filter(p => {
      const nv = `${p.name}@${p.version}`;
      if (prodScope.versions.has(nv)) return true;
      if (!prodScope.names.has(p.name)) return false;
      return !hasOtherPinnedNameVersion(
        prodScope.versions,
        p.name,
        nv
      );
    });
    const skipped = allPackages.length - packages.length;
    scopeNote = `production graph (${skipped} dev/transitive-dev-only entries skipped)`;
  }
  if (packages.length === 0) {
    console.log("[audit-deps] no packages in production closure — nothing to do.");
    return;
  }
  console.log(
    `[audit-deps] querying osv.dev for ${packages.length} packages from pnpm-lock.yaml (${scopeNote})`,
  );

  const findingsByKey = await queryBatch(packages);
  const allAdvisoryIds = [];
  for (const vulns of findingsByKey.values()) {
    for (const v of vulns) allAdvisoryIds.push(v.id);
  }
  if (allAdvisoryIds.length === 0) {
    console.log("[audit-deps] no advisories found — clean.");
    return;
  }
  const severityMap = await fetchSeverityMap(allAdvisoryIds);

  const { failing, unresolved, totalBySev } = summariseFindings(
    findingsByKey,
    severityMap,
    SEVERITY_THRESHOLDS
  );

  const summary = [...totalBySev.entries()]
    .sort()
    .map(([s, n]) => `${s}=${n}`)
    .join(" ");
  console.log(`[audit-deps] advisory totals: ${summary}`);

  // Fail-closed guard: any UNKNOWN severity means a per-advisory
  // lookup never returned a parseable `database_specific.severity`.
  // We can't differentiate "low severity with no field" from
  // "HIGH/CRITICAL whose fetch timed out" without that field, and
  // a transient outage must not turn the audit into a clean-pass
  // rubber stamp. Exit 2 (operational failure) so a contributor
  // reruns once osv.dev is reachable; the alternative — exit 1 —
  // is indistinguishable from real findings in CI logs.
  if (unresolved.length > 0) {
    console.error(
      `\n[audit-deps] ${unresolved.length} advisory severity lookup(s) could not be resolved ` +
        `from osv.dev (UNKNOWN — transient outage, rate-limit, or upstream API change). ` +
        `Cannot claim the audit is clean; failing closed. Re-run when osv.dev is reachable.`,
    );
    for (const u of unresolved) {
      console.error(formatFinding(u.pkg, u.id, "UNKNOWN"));
    }
    process.exit(2);
  }

  if (failing.length > 0) {
    console.error("\n[audit-deps] HIGH/CRITICAL advisories found:\n");
    console.error(failing.join("\n"));
    console.error(
      `\n[audit-deps] ${failing.length} finding(s) at or above HIGH severity — failing.`,
    );
    process.exit(1);
  }
  console.log("[audit-deps] no HIGH/CRITICAL advisories — passing.");
}

main().catch(err => {
  console.error(`[audit-deps] operational failure: ${err?.stack ?? err}`);
  process.exit(2);
});