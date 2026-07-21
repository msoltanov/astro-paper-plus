import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression cover for the gitleaks tarball extraction in
 * `scripts/secret-scan.mjs`.
 *
 * The shipped argv was `-xzf <archive> gitleaks -C <cacheDir>` — `-C`
 * AFTER the member name. GNU tar documents `-C` as order-sensitive
 * ("affects all options that follow"), so it extracted `gitleaks`
 * relative to the CWD, applied the `-C` to nothing, and still exited
 * 0. The wrapper only noticed at its `existsSync` check, one step too
 * late, with the binary sitting in the repo root and
 * `.cache/gitleaks/` empty.
 *
 * It was invisible locally because Windows takes the `.zip` /
 * `Expand-Archive` branch and never runs this line at all.
 */

const moduleUrl = pathToFileURL(resolve("scripts/secret-scan.mjs")).href;

/** Matches the subprocess convention used by the sibling
 *  `secretScanChecksum.test.ts` — `secret-scan.mjs` is an executable
 *  entry point, so we read its exports out of a child process. */
function readArgs(archivePath: string, cacheDir: string): string[] {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const m = await import(${JSON.stringify(moduleUrl)});` +
        `process.stdout.write(JSON.stringify(m.tarExtractArgs(${JSON.stringify(
          archivePath
        )}, ${JSON.stringify(cacheDir)})));`,
    ],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as string[];
}

describe("secret scan tar extraction args", () => {
  it("puts -C before the member name", () => {
    const args = readArgs("/tmp/gitleaks.tar.gz", "/tmp/cache");
    expect(args).toEqual([
      "-xzf",
      "/tmp/gitleaks.tar.gz",
      "-C",
      "/tmp/cache",
      "gitleaks",
    ]);
    // The invariant itself, stated independently of the exact paths:
    // if `-C` ever drifts back after the member, GNU tar silently
    // extracts to the CWD again.
    expect(args.indexOf("-C")).toBeLessThan(args.indexOf("gitleaks"));
  });

  it("extracts the member into the target dir, not the cwd", () => {
    // Behavioural half: runs a real `tar`. Portable — the corrected
    // ordering is valid for both GNU tar (Linux/CI) and bsdtar
    // (Windows/macOS), which is the whole point of fixing it rather
    // than special-casing per platform.
    const dir = mkdtempSync(join(tmpdir(), "secret-scan-tar-"));
    try {
      const src = join(dir, "src");
      const cache = join(dir, "cache");
      const cwd = join(dir, "cwd");
      for (const d of [src, cache, cwd]) mkdirSync(d, { recursive: true });
      writeFileSync(join(src, "gitleaks"), "#!/bin/sh\necho fake\n");
      writeFileSync(join(src, "README.md"), "gitleaks ships test fixtures\n");

      const archive = join(dir, "gitleaks.tar.gz");
      const created = spawnSync(
        "tar",
        ["-czf", archive, "-C", src, "gitleaks", "README.md"],
        { encoding: "utf8" }
      );
      expect(created.status).toBe(0);

      // Extract from a DIFFERENT cwd, so a `-C` that silently no-ops
      // drops the binary there — reproducing the exact CI failure.
      const extracted = spawnSync("tar", readArgs(archive, cache), {
        cwd,
        encoding: "utf8",
      });
      expect(extracted.status).toBe(0);

      expect(existsSync(join(cache, "gitleaks"))).toBe(true);
      expect(existsSync(join(cwd, "gitleaks"))).toBe(false);
      // Only the requested member — gitleaks' README is a bag of
      // deliberately-fake credentials that the working-tree pass
      // would otherwise flag.
      expect(existsSync(join(cache, "README.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
