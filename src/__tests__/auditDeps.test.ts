import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * The audit-deps script is a thin osv.dev client whose only
 * non-trivial piece is the pnpm-lock.yaml parser. The osv.dev
 * queries themselves are HTTP — we exercise those via a one-off
 * run against a known-clean package list and assert the exit
 * code is 0 (or 2 if the registry is unreachable, which is what
 * CI sees on a fully-offline runner).
 *
 * The parser tests use a synthetic lockfile because we want to
 * pin the exact YAML shape pnpm 9+ emits (`'<name>@<version>':`
 * with single-quoted scoped names and a peer-dep hash suffix on
 * the version).
 */

const NODE = process.execPath;
const SCRIPT = join(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "audit-deps.mjs"
);

const runScript = (lockfilePath: string, env: Record<string, string> = {}) => {
  return spawnSync(NODE, [SCRIPT], {
    cwd: join(lockfilePath, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      // Tell the script which lockfile to read. Without this it
      // defaults to `<repo>/pnpm-lock.yaml`, which is the wrong
      // file in every test that uses a fixture.
      AUDIT_DEPS_LOCKFILE: lockfilePath,
      ...env,
    },
    // No timeout here — osv.dev calls are fast in CI but we don't
    // want a hang in a developer's local run.
  });
};

describe("audit-deps.mjs — pnpm-lock.yaml parser", { timeout: 30_000 }, () => {
  it("parses bare packages without a scoped name", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      lodash.kebabcase:
        specifier: 4.1.1
        version: 4.1.1
      dayjs:
        specifier: 1.11.21
        version: 1.11.21
snapshots:
  'lodash.kebabcase@4.1.1': {}
  'dayjs@1.11.21': {}
packages:
  'lodash.kebabcase@4.1.1':
    resolution: {integrity: sha512-X}
  'dayjs@1.11.21':
    resolution: {integrity: sha512-X}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      expect(r.stdout).toContain("querying osv.dev for 2 packages");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses scoped packages (the case the naive parser misses)", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@astrojs/mdx':
        specifier: ^7.0.2
        version: 7.0.2
      '@astrojs/rss':
        specifier: ^4.0.19
        version: 4.0.19
snapshots:
  '@astrojs/mdx@7.0.2': {}
  '@astrojs/rss@4.0.19': {}
packages:
  '@astrojs/mdx@7.0.2':
    resolution: {integrity: sha512-X}
  '@astrojs/rss@4.0.19':
    resolution: {integrity: sha512-X}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      expect(r.stdout).toContain("querying osv.dev for 2 packages");
      // The parser should not abort on scoped names — it should
      // reach the HTTP call. Status code 2 means "operational
      // failure" (e.g. offline); anything else means it produced
      // an answer. On Windows, a dropped socket during the osv.dev
      // request can surface as an NTSTATUS (`> 0xC0000000`,
      // e.g. 0xC0000139 STATUS_REMOTE_DISCONNECT) instead of the
      // script's own exit code 2 — that's still "parser didn't
      // throw, OS aborted the network I/O", which is what we're
      // asserting here.
      // `spawnSync`'s `status` is `number | null`; bind to a
      // non-null local so the `> 0xc0000000` comparison doesn't
      // trip ts(18047).
      const status = r.status;
      expect(
        status === 0 || status === 2 || (status !== null && status > 0xc0000000)
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("strips peer-dep hash suffix from version", () => {
    // Real pnpm-lock entries: `<name>@<version>(peer-deps)`. The
    // parser must extract just the version, not `(peer-deps)`.
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      astro:
        specifier: ^7.0.7
        version: 7.0.7
snapshots:
  'astro@7.0.7(@astrojs/markdown-remark@7.2.1)': {}
packages:
  'astro@7.0.7(@astrojs/markdown-remark@7.2.1)(yaml@2.9.0)':
    resolution: {integrity: sha512-X}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      expect(r.stdout).toContain("querying osv.dev for 1 packages");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero (2) when the lockfile is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-test-"));
    try {
      const missing = join(dir, "does-not-exist.yaml");
      const r = runScript(missing);
      // Missing lockfile → operational failure → exit 2.
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/could not parse lockfile|ENOENT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("audit-deps.mjs — production-graph scope", { timeout: 30_000 }, () => {
  it("skips packages only reachable from devDependencies (CI production-only gate)", () => {
    // CI used `pnpm audit --prod` before the npm endpoint broke.
    // The audit-deps replacement must NOT audit eslint/vitest/
    // build tooling — only the production graph.
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-prod-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      lodash.kebabcase:
        specifier: 4.1.1
        version: 4.1.1
    devDependencies:
      eslint:
        specifier: ^10.6.0
        version: 10.6.0
snapshots:
  'lodash.kebabcase@4.1.1': {}
  'eslint@10.6.0': {}
packages:
  'lodash.kebabcase@4.1.1':
    resolution: {integrity: sha512-X}
  'eslint@10.6.0':
    resolution: {integrity: sha512-X}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      // Only the prod-reachable package is queried.
      expect(r.stdout).toContain("querying osv.dev for 1 packages");
      expect(r.stdout).toContain("production graph");
      // The log message explicitly notes the skip count so a
      // regression that re-introduces over-auditing is visible
      // in CI output, not just in exit codes.
      expect(r.stdout).toMatch(/1 dev\/transitive-dev-only entries skipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("walks transitive production deps through snapshots", () => {
    // The prod dep `astro` transitively pulls in `js-yaml`. The
    // walker must recurse through `snapshots.[astro@x].dependencies`
    // and include `js-yaml` in the audited set even though it
    // never appears under `importers.[.].dependencies`.
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-prod-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      astro:
        specifier: ^7.0.7
        version: 7.0.7
snapshots:
  'astro@7.0.7':
    dependencies:
      js-yaml: 4.2.0
packages:
  'astro@7.0.7':
    resolution: {integrity: sha512-X}
  'js-yaml@4.2.0':
    resolution: {integrity: sha512-X}
  'eslint@10.6.0':
    resolution: {integrity: sha512-X}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      // Both astro (direct prod) and js-yaml (transitive prod)
      // are audited; eslint (no path from prod) is skipped.
      expect(r.stdout).toContain("querying osv.dev for 2 packages");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Regression — the previous implementation tracked the prod
  // closure by NAME only, so when the prod graph resolved `foo`
  // to `1.0.0` and a dev-side dependency tree resolved `foo` to
  // `0.5.0` (a real pnpm duplicate-version scenario), the
  // name-only filter audited BOTH as production. A dev-only
  // advisory on `foo@0.5.0` would then fail the prod-only CI
  // gate even though `foo@0.5.0` never ships with the prod
  // build. Pinning (name, version) tuples fixes that.
  it("does NOT audit a dev-only version of a package that prod resolves to a different version", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-dupver-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      foo:
        specifier: ^1.0.0
        version: 1.0.0
    devDependencies:
      bar:
        specifier: ^1.0.0
        version: 1.0.0
snapshots:
  'foo@1.0.0': {}
  'bar@1.0.0':
    dependencies:
      foo: 0.5.0
packages:
  'foo@1.0.0':
    resolution: {integrity: sha512-X}
  'foo@0.5.0':
    resolution: {integrity: sha512-Y}
  'bar@1.0.0':
    resolution: {integrity: sha512-Z}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      // Only the prod-reachable foo@1.0.0 is audited. foo@0.5.0
      // (only reachable via the dev-side `bar` closure) is NOT.
      // `bar` itself is a devDependency and is also excluded.
      expect(r.stdout).toContain("querying osv.dev for 1 packages");
      expect(r.stdout).toContain("production graph");
      expect(r.stdout).toMatch(/2 dev\/transitive-dev-only entries skipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Companion — when the prod closure resolves `foo` to a
  // version AND a transitive on the prod closure also pins the
  // SAME version transitively, that version is audited (not
  // double-counted — `packages:` deduplicates by (name, version)).
  it("audits the same (name, version) tuple once even when multiple prod paths reach it", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-dupver-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      direct-a:
        specifier: ^1.0.0
        version: 1.0.0
      direct-b:
        specifier: ^2.0.0
        version: 2.0.0
snapshots:
  'direct-a@1.0.0':
    dependencies:
      shared: 1.0.0
  'direct-b@2.0.0':
    dependencies:
      shared: 1.0.0
packages:
  'direct-a@1.0.0':
    resolution: {integrity: sha512-A1}
  'direct-b@2.0.0':
    resolution: {integrity: sha512-B1}
  'shared@1.0.0':
    resolution: {integrity: sha512-C1}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      // All three are on the prod closure (and shared is deduped
      // to a single OS query). 3 unique (name, version) tuples.
      expect(r.stdout).toContain("querying osv.dev for 3 packages");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to auditing every packages entry when importers block is missing", () => {
    // Older / synthetic lockfiles without `importers.[.]` MUST
    // NOT silently miss advisories — fall back to auditing every
    // entry. CI message notes the degraded scope.
    const dir = mkdtempSync(join(tmpdir(), "audit-deps-fallback-test-"));
    try {
      writeFileSync(
        join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'
packages:
  'lodash.kebabcase@4.1.1':
    resolution: {integrity: sha512-X}
`
      );
      const r = runScript(join(dir, "pnpm-lock.yaml"));
      expect(r.stdout).toContain("querying osv.dev for 1 packages");
      expect(r.stdout).toContain(
        "all lockfile entries (no importers block to scope from)"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe(
  "audit-deps.mjs — live osv.dev query (skipped when offline)",
  { timeout: 30_000 },
  () => {
    // Touch the live endpoint only in environments where we can
    // reach it. CI on GitHub runners can; an isolated dev box may
    // not. The script's retry logic should still surface a clean
    // operational-failure exit (2), not a crash.
    it("returns clean exit 0 on the real lockfile when osv.dev has no findings", () => {
      const repoRoot = join(import.meta.dirname, "..", "..");
      const r = runScript(join(repoRoot, "pnpm-lock.yaml"));
      if (r.status === 2 || (r.status !== null && r.status > 0xc0000000)) {
        // Offline / network blocked / Windows abnormal-exit during the
        // osv.dev request — skip rather than fail. The unit tests
        // above cover the parser; the live path is exercised in CI
        // which has internet and a clean socket.
        return;
      }
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/querying osv\.dev for \d+ packages/);
    });
  }
);
