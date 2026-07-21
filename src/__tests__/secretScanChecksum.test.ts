import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const moduleUrl = pathToFileURL(resolve("scripts/secret-scan.mjs")).href;
const hash = "a".repeat(64);

function run(source: string) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const m = await import(${JSON.stringify(moduleUrl)});${source}`,
    ],
    { encoding: "utf8" }
  );
}

describe("secret scan release checksums", () => {
  it("selects the checksum for the requested release asset", () => {
    const result = run(
      `process.stdout.write(m.checksumForAsset(${JSON.stringify(`${"b".repeat(64)}  other.tar.gz\n${hash} *gitleaks.tar.gz\n`)}, "gitleaks.tar.gz"));`
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(hash);
  });

  it("rejects a checksum mismatch", () => {
    const result = run(
      `try { m.assertMatchingChecksum("gitleaks.tar.gz", ${JSON.stringify(hash)}, ${JSON.stringify("b".repeat(64))}); } catch (error) { process.stderr.write(error.message); process.exit(42); }`
    );

    expect(result.status).toBe(42);
    expect(result.stderr).toMatch(/SHA-256 mismatch/);
  });

  it("accepts a matching checksum", () => {
    const result = run(
      `m.assertMatchingChecksum("gitleaks.tar.gz", ${JSON.stringify(hash)}, ${JSON.stringify(hash)});`
    );

    expect(result.status).toBe(0);
  });
});
