#!/usr/bin/env node
/**
 * Install the project's git hooks (currently just `.githooks/pre-commit`).
 *
 * Idempotent — safe to re-run. Sets `core.hooksPath` to `.githooks` (relative
 * to the repo root) and makes the hook executable on POSIX systems.
 *
 * Wired via `package.json`'s `prepare` script so every `pnpm install` (CI
 * and dev) sets up the hook. Manual entry point: `pnpm setup:hooks`.
 *
 * The `prepare` lifecycle fires on every `pnpm install`, including
 * tarball-based installs (Docker `COPY`, npm registry mirrors,
 * monorepo consumers that vendor this repo without `.git`). When
 * invoked outside a git checkout we no-op loudly and return 0 so
 * downstream installs don't abort — the failure mode is "no hook
 * wired", not "broken install".
 *
 * Why not husky / simple-git-hooks? Both add a runtime dep that
 * auto-installs via `prepare`. This script does the same job with no
 * added dependency — `core.hooksPath` is a first-class git feature
 * (since git 2.9) and the hook is committed to the repo (`.githooks/`
 * is NOT gitignored). The cost is one `git config` call.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const preCommitHook = join(repoRoot, ".githooks", "pre-commit");
const gitDir = join(repoRoot, ".git");

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
}

/** True iff `git` resolves on PATH and `--version` exits 0. Cheap
 * probe — no repo needed. Avoids catching unrelated errors (e.g.
 * git installed but misconfigured credentials) by swallowing only
 * the spawn failure. */
function hasGitOnPath() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  // CI doesn't need local hooks — skip the `git config` call so
  // the environment variable gate is cheaper than probing `.git`.
  if (process.env.CI === "true") {
    console.log("[install-hooks] CI environment detected; skipping hook install.");
    return;
  }

  // No-op outside a git checkout. The `prepare` lifecycle fires
  // on tarball installs and Docker `COPY` stages; failing the
  // install because we can't wire a hook there is wrong. We probe
  // for `.git` AND a usable `git` binary so we don't half-install
  // (hook chmod'd, config skipped → silent drift on next run).
  if (!existsSync(gitDir)) {
    console.log(
      `[install-hooks] not a git checkout (no ${gitDir}); skipping hook install.`
    );
    return;
  }
  if (!hasGitOnPath()) {
    console.log(
      "[install-hooks] `git` not on PATH; skipping hook install."
    );
    return;
  }

  if (!existsSync(preCommitHook)) {
    console.error(
      `[install-hooks] expected hook at ${preCommitHook} but it is missing.`
    );
    process.exit(1);
  }

  // Make the hook executable on POSIX systems. Windows ignores the
  // executable bit and runs hooks through Git Bash anyway, so this
  // is a no-op there.
  if (process.platform !== "win32") {
    try {
      chmodSync(preCommitHook, 0o755);
    } catch (err) {
      console.error(
        `[install-hooks] failed to chmod ${preCommitHook}: ${err.message}`
      );
      process.exit(1);
    }
  }

  try {
    run("git", ["config", "core.hooksPath", ".githooks"]);
  } catch (err) {
    console.error(
      `[install-hooks] git config core.hooksPath failed: ${err.message}`
    );
    process.exit(1);
  }

  console.log(
    "[install-hooks] git hooks installed (core.hooksPath=.githooks)."
  );
}

main();