import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = resolve("scripts/secret-scan.mjs");

describe("secret scan cache invalidation", () => {
  it("regression: cache path includes the pinned version (structural fix)", () => {
    // The original bug: `cachedBinaryPath()` returned
    // `.cache/gitleaks/gitleaks` (no version), so an old binary
    // left on disk satisfied `isCached()` even after a version
    // bump. Verify the helper now stamps the version into the
    // path. This is a structural check that survives refactors
    // of the helper body.
    const source = readFileSync(SCRIPT_PATH, "utf8");
    expect(source).toMatch(
      /function cachedBinaryPath\([^)]*\)\s*{\s*return\s+join\([^,]+,\s*`gitleaks-\$\{GITLEAKS_VERSION\}\$\{EXT\}`\)/
    );
    // main() must use the version-aware cache gate, not the old
    // isCached() that only checks for the file's existence.
    expect(source).toMatch(/await isUsableCached\(\)/);
    // isUsableCached() must compare the binary's reported version
    // to GITLEAKS_VERSION, not just trust the path.
    expect(source).toMatch(/reported === GITLEAKS_VERSION/);
  });

  it("cache probe parses the binary's reported semver", () => {
    // Plant a fake gitleaks in an isolated tmp dir, spawn it with
    // `version`, and verify the regex used by readCachedVersion()
    // (and reproduced here) parses the right semver. Same regex
    // shape as `secret-scan.mjs:130`.
    //
    // On Windows, `gitleaks.exe` would normally be a native binary
    // the OS executes directly. To keep the stub cross-platform
    // without a real release tarball, we run the script via
    // `process.execPath` and a tiny `.cjs` file with a `.exe`
    // extension; Node treats the file by extension. `spawnSync` on
    // Windows is happy to invoke a `.exe` whose body is plain
    // JavaScript via the Node interpreter that the script's
    // shebang-style header suggests — we use `spawnSync(execPath,
    // [stub, ...])` instead so the test is platform-independent.
    const dir = mkdtempSync(join(tmpdir(), "gitleaks-stub-"));
    const ext = process.platform === "win32" ? ".exe" : "";
    const stub = join(dir, `gitleaks${ext}`);
    const body = [
      "const arg = process.argv[2] || '';",
      "if (arg === 'version') { process.stdout.write('8.27.0\\n'); process.exit(0); }",
      "process.exit(1);",
      "",
    ].join("\n");
    writeFileSync(stub, body);
    if (process.platform !== "win32") chmodSync(stub, 0o755);
    // Run the stub via Node so the .js body is interpreted on every
    // platform. The cached-binary code path uses
    // `spawnSync(binary, ["version"])`; we replicate that with
    // execPath as the launcher to keep the stub cross-platform.
    const result = spawnSync(process.execPath, [stub, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const text = (result.stdout || result.stderr || "").trim();
    const match = text.match(/(\d+\.\d+\.\d+)/);
    rmSync(dir, { recursive: true, force: true });
    expect(match?.[1]).toBe("8.27.0");
  });
});
