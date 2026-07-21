/**
 * `secret-scan-version.mjs` — reads the pinned `GITLEAKS_VERSION`
 * from `scripts/secret-scan.mjs` and prints it on stdout.
 *
 * Called by the `secrets` job in `.github/workflows/ci.yml` to read
 * the version WITHOUT going through bash-quoted node -p expressions
 * (the previous inline `node -p` was being truncated by nested YAML
 * quoting; see issues.md P0-2).
 *
 * Output: a single semver line, e.g. `8.27.0`.
 * Exit:   0 on success, 1 on read failure.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(SCRIPT_DIR, "secret-scan.mjs");

const source = readFileSync(TARGET, "utf8");
const match = source.match(/const\s+GITLEAKS_VERSION\s*=\s*"([^"]+)"/);
if (!match) {
  process.stderr.write(
    `[secret-scan-version] could not find GITLEAKS_VERSION in ${TARGET}.\n`
  );
  process.exit(1);
}

process.stdout.write(`${match[1]}\n`);
