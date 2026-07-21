/**
 * Tests for `scripts/copy-pagefind.mjs`.
 *
 * The script copies the built Pagefind index from `dist/pagefind/` into
 * `public/pagefind/` so `astro dev` (which only serves `public/`) can
 * hand `/search` a working bundle. These tests pin the safeguards
 * against stale fragments — see the script header for the design wart
 * context (ideal fix is a Vite middleware; this is the cheapest viable
 * shape until then).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/copy-pagefind.mjs", import.meta.url)
);

function setupSandbox() {
  // Use a tmp sandbox so the test never touches the repo's real
  // `dist/` or `public/` trees. We invoke the script via
  // `--cwd <sandbox>` and patch `process.cwd()` via the shell wrapper
  // by re-launching node with `process.chdir` not feasible — instead
  // we set `process.cwd()` indirectly by running with `cwd` option.
  const sandbox = join(
    process.env.TEMP ?? process.env.TMPDIR ?? ".",
    `copy-pagefind-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(join(sandbox, "dist", "pagefind"), { recursive: true });
  mkdirSync(sandbox, { recursive: true });
  writeFileSync(
    join(sandbox, "dist", "pagefind", "pagefind.js"),
    "// pagefind bundle stub"
  );
  writeFileSync(
    join(sandbox, "dist", "pagefind", "pagefind-entry.json"),
    JSON.stringify({ version: "test" })
  );
  return sandbox;
}

function teardownSandbox(sandbox: string) {
  rmSync(sandbox, { recursive: true, force: true });
}

function runCopy(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("copy-pagefind.mjs", () => {
  let sandbox: string;
  beforeEach(() => {
    sandbox = setupSandbox();
  });
  afterEach(() => {
    teardownSandbox(sandbox);
  });

  it("copies the dist/pagefind/ tree into public/pagefind/", () => {
    const r = runCopy(sandbox);
    expect(r.status).toBe(0);
    expect(existsSync(join(sandbox, "public", "pagefind", "pagefind.js"))).toBe(
      true
    );
    expect(
      readFileSync(
        join(sandbox, "public", "pagefind", "pagefind-entry.json"),
        "utf8"
      )
    ).toBe(JSON.stringify({ version: "test" }));
  });

  it("wipes a stale destination before copying so renamed/removed files do not linger", () => {
    // Pre-populate dest with a file that does NOT exist in the new
    // build, simulating a previous build that added an asset the
    // current build dropped.
    mkdirSync(join(sandbox, "public", "pagefind"), { recursive: true });
    writeFileSync(
      join(sandbox, "public", "pagefind", "deprecated-from-old-build.js"),
      "// leftover"
    );

    const r = runCopy(sandbox);
    expect(r.status).toBe(0);

    // The new files are present.
    expect(existsSync(join(sandbox, "public", "pagefind", "pagefind.js"))).toBe(
      true
    );
    // The stale file is gone.
    expect(
      existsSync(
        join(sandbox, "public", "pagefind", "deprecated-from-old-build.js")
      )
    ).toBe(false);
  });

  it("preserves the destination when --no-clean is passed (debug escape hatch)", () => {
    mkdirSync(join(sandbox, "public", "pagefind"), { recursive: true });
    writeFileSync(
      join(sandbox, "public", "pagefind", "kept-on-purpose.js"),
      "// debug"
    );

    const r = runCopy(sandbox, ["--no-clean"]);
    expect(r.status).toBe(0);

    // The new files are present.
    expect(existsSync(join(sandbox, "public", "pagefind", "pagefind.js"))).toBe(
      true
    );
    // The pre-existing file is still there because --no-clean skipped the wipe.
    expect(
      existsSync(join(sandbox, "public", "pagefind", "kept-on-purpose.js"))
    ).toBe(true);
  });

  it("exits 1 with a clear message when the source is missing", () => {
    rmSync(join(sandbox, "dist", "pagefind"), { recursive: true, force: true });
    const r = runCopy(sandbox);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/source not found/);
  });

  it("suppresses the success banner with --quiet", () => {
    const r = runCopy(sandbox, ["--quiet"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
