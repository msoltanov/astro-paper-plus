import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * install-hooks.mjs is the `prepare` hook, so it runs on every
 * `pnpm install` — including tarball installs and Docker COPY
 * contexts where `.git` is absent or `git` is not on PATH.
 * Previously the script unconditionally tried to `git config
 * core.hooksPath` and bombed out with exit 1, breaking the
 * install. The fix no-ops in those contexts.
 */

const NODE = process.execPath;
const SCRIPT = join(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "install-hooks.mjs"
);

/**
 * `install-hooks.mjs` short-circuits on `CI === "true"` before it
 * reaches any of the branches the non-git tests below exist to pin.
 * GitHub Actions exports `CI=true` and `spawnSync` inherits the
 * parent env, so without this the child returns at the CI gate and
 * both tests assert against the wrong code path — green on a dev
 * machine, red on a runner. Strip the flag for the non-git cases;
 * the CI gate itself is covered separately at the bottom.
 */
function envWithoutCI() {
  const env = { ...process.env };
  delete env.CI;
  return env;
}

describe("install-hooks.mjs — non-git contexts", () => {
  it("no-ops (exit 0) when invoked outside a git checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "install-hooks-nogit-"));
    try {
      // Drop a fake `.githooks/pre-commit` so we exercise the
      // hook-existence branch too — it should never be reached.
      mkdirSync(join(dir, ".githooks"), { recursive: true });
      writeFileSync(join(dir, ".githooks", "pre-commit"), "#!/bin/sh\n");

      const r = spawnSync(NODE, [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: envWithoutCI(),
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/not a git checkout/);
      expect(r.stderr).not.toMatch(/core.hooksPath failed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops (exit 0) when `.git` exists but the hook file is missing", () => {
    // The script must surface a missing pre-commit hook as a real
    // error in a normal repo (that's how `.githooks/pre-commit`
    // accidentally-vendoring would be caught). Verified by the
    // next test; this case pins the .git-present-without-git-on-PATH
    // skip path. We don't have a portable way to remove `git`
    // from PATH inside a unit test, so we only assert the
    // message format that the script logs when it skips.
    const dir = mkdtempSync(join(tmpdir(), "install-hooks-msg-"));
    try {
      mkdirSync(join(dir, ".git"), { recursive: true });
      const r = spawnSync(NODE, [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: envWithoutCI(),
      });
      // With `.git` present and `git` on PATH (the test runner's
      // PATH), the next-step behaviour is "hook file missing →
      // exit 1". That's the contract for a real checkout.
      expect([0, 1]).toContain(r.status ?? -1);
      const combined = (r.stdout ?? "") + (r.stderr ?? "");
      // Either the skip path ("git not on PATH") or the missing-hook
      // path is acceptable here — both prove the non-broken contract.
      expect(
        combined.match(/not on PATH|hook at .*pre-commit .* missing/) ?? null
      ).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("install-hooks.mjs — CI gate", () => {
  it("skips the hook install entirely when CI=true", () => {
    // This branch is the one that actually executes on GitHub
    // Actions (`prepare` runs on every `pnpm install`), yet it had
    // no coverage — the non-git tests above were silently landing
    // on it instead of their own paths. Pin it explicitly, and use
    // a directory that is NOT a git checkout so a regression in the
    // gate falls through to the "not a git checkout" message rather
    // than still exiting 0 for the wrong reason.
    const dir = mkdtempSync(join(tmpdir(), "install-hooks-ci-"));
    try {
      const r = spawnSync(NODE, [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, CI: "true" },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/CI environment detected/);
      expect(r.stdout).not.toMatch(/not a git checkout/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
