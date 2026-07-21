#!/usr/bin/env node
/**
 * `gate.mjs` — pre-publish gate runner for the AstroPaper+ fork.
 *
 * Runs the gate's commands in order and writes the
 * full output (stdout + stderr) of each step to a single log file
 * outside the repo. Exits non-zero on the first failure so it
 * composes with CI / pre-commit hooks.
 *
 * Why this exists
 * ---------------
 * The local pre-publish gate used to live as a personal discipline
 * of piping each `pnpm <gate>` invocation through PowerShell's
 * `Tee-Object` to a `.tmp-*.local.log` file at the repo root. That
 * worked on one machine, but:
 *
 *   - It produced 4-7 transient files in the repo root per run.
 *   - It wasn't reproducible by other contributors.
 *   - `.gitignore` had to absorb the noise.
 *
 * The CI workflow (`.github/workflows/ci.yml`) already runs the
 * same commands (CI overlaps with the local gate but is not identical —
 * see the table in `CLAUDE.md`). This script is the **local mirror**
 * of the CI gate — one command, one log file, one exit code. The log
 * file lives in the OS temp directory by default so it never enters
 * the repo tree; override with the `ASTRO_PAPER_GATE_LOG` env var.
 *
 * Output
 * ------
 *   - stdout: a one-line PASS/FAIL banner per step + the final
 *     log path. Tail-friendly for quick scanning.
 *   - the log file: the full output of every step, in order, with
 *     `=== <command> ===` headers. Open it in your editor of choice
 *     for a deep dive after a failure.
 *
 * Stop conditions
 * ---------------
 *   - All steps exit 0  → exit 0, log shows a PASS banner for every
 *     step in the gate (currently thirteen: format:check, lint, astro
 *     check, test:coverage, check-content, check-security,
 *     check-md-script, build:site, check-iframe-allowlist,
 *     test:nginx-headers, check-og, audit:ci, secret:scan).
 *   - Any step exits non-zero → log shows that step's full output,
 *     script exits with that step's exit code, subsequent steps
 *     are NOT run. (Fail-fast mirrors `&&` semantics in the
 *     `pnpm build` script.)
 *
 * Usage
 * -----
 *   pnpm gate                        # run the gate, log to OS temp
 *   ASTRO_PAPER_GATE_LOG=./gate.log pnpm gate
 *                                    # log to a specific path
 *   node scripts/gate.mjs            # direct invocation also works
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const STEPS = [
  { name: "format:check", cmd: "pnpm", args: ["format:check"] },
  { name: "lint", cmd: "pnpm", args: ["lint"] },
  { name: "astro check", cmd: "pnpm", args: ["astro", "check"] },

  { name: "test:coverage", cmd: "pnpm", args: ["test:coverage"] },
  { name: "check-content", cmd: "node", args: ["scripts/check-content.mjs"] },
  { name: "check-security", cmd: "node", args: ["scripts/check-security.mjs"] },
  { name: "check-md-script", cmd: "node", args: ["scripts/check-md-script.mjs"] },
  { name: "build:site", cmd: "pnpm", args: ["build:site"] },
  { name: "check-iframe-allowlist", cmd: "node", args: ["scripts/check-iframe-allowlist.mjs"] },
  {
    name: "test:nginx-headers",
    cmd: "pnpm",
    args: ["test:nginx-headers"],
  },
  { name: "check-og", cmd: "node", args: ["scripts/check-og.mjs"] },
  { name: "audit:ci", cmd: "pnpm", args: ["audit:ci"] },
  { name: "secret:scan", cmd: "pnpm", args: ["secret:scan"] },
];

const logPath =
  process.env.ASTRO_PAPER_GATE_LOG ?? join(tmpdir(), `astro-paper-gate-${process.pid}.log`);

mkdirSync(dirname(logPath), { recursive: true });
const out = createWriteStream(logPath, { flags: "w" });

const header = (s) => `\n=== ${s} (${new Date().toISOString()}) ===\n`;
const section = (s) => `\n----- ${s} -----\n`;

// Cross-platform pnpm invocation. On Windows, `pnpm` is a `.cmd` shim
// that Node's `spawnSync` (with `shell: false`) cannot resolve through
// PATHEXT — the child process spawns successfully but the actual
// script body never runs, producing `status: null` and empty
// stdout/stderr. Wrapping in `cmd.exe /c` (Windows) or `/bin/sh -c`
// (POSIX) makes the shell resolve the shim correctly. Command names
// and arguments are hard-coded constants — no shell injection risk.
//
// Quoting note: do NOT add quotes around individual args here. With
// `cmd /c "pnpm \"test\""` cmd strips the outer quotes and pnpm
// receives a literal `test` argument WITH the inner quotes still
// attached, which it then rejects as `?ERR_PNPM_RECURSIVE_EXEC`.
// Joining args with a single space — no per-arg quoting — is correct.
const SHELL_CMD = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
const SHELL_ARG = process.platform === "win32" ? "/c" : "-c";

let failed = false;
// P1-21: track the LAST non-zero exit code we observed rather than
// collapsing every failure to `1`. CI / pre-commit consumers can
// then distinguish a missing-eslint-config from a TypeScript error
// (which they couldn't before). `0` until we hit the first failure.
let lastNonZero = 0;
for (const step of STEPS) {
  process.stdout.write(`[gate] running ${step.name} ... `);
  out.write(header(`${step.cmd} ${step.args.join(" ")}`));

  const shellLine = `${step.cmd} ${step.args.join(" ")}`;
  const result = spawnSync(SHELL_CMD, [SHELL_ARG, shellLine], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });

  out.write(section("stdout"));
  out.write(result.stdout ?? "");
  out.write(section("stderr"));
  out.write(result.stderr ?? "");
  out.write(section("exit"));
  out.write(String(result.status ?? "signal " + result.signal));

  if (result.status !== 0) {
    failed = true;
    lastNonZero = result.status ?? 1;
    process.stdout.write(
      `FAIL (exit ${result.status ?? result.signal}). Gate log: ${logPath}\n`,
    );
    out.write(`\n=== GATE ABORTED AT STEP "${step.name}" ===\n`);
    break;
  }
  process.stdout.write("PASS\n");
}

if (!failed) {
    out.write(`\n=== GATE PASSED (${new Date().toISOString()}) ===\n`);
  process.stdout.write(`\n[gate] all steps passed. Log: ${logPath}\n`);
}

// P1-21: exit with the actual failing step's code (was hard-coded
// `1`). Use `out.on('finish', ...)` instead of `out.end(...)` because
// the latter fires the callback synchronously while the kernel pipe
// may still hold unflushed bytes (the original implementation
// occasionally produced a truncated tail in `astro-paper-gate.log`).
out.on("finish", () => {
  process.exit(failed ? lastNonZero || 1 : 0);
});
// Belt-and-braces: `out.end()` without a callback finishes the
// stream too — we add it so the process exits even on the
// fast-fail path where `out.end` was previously called immediately
// (the original signature was `out.end(callback)`).
out.end();
