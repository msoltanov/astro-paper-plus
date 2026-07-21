#!/usr/bin/env node
// Bump-bot helper for the gitleaks version pinned in
// `scripts/secret-scan.mjs`. The companion workflow
// `.github/workflows/gitleaks-bump.yml` runs this weekly via cron
// and opens a PR when upstream ships a new release.
//
// Behaviour:
//   1. GET the latest non-prerelease gitleaks release from GitHub.
//   2. Read the current `GITLEAKS_VERSION` constant from
//      `scripts/secret-scan.mjs`.
//   3. Emit a tiny JSON report to stdout (workflow reads it via
//      `set-output`): `{ "current", "latest", "changed" }`.
//
// The actual file edit + PR open is done by the workflow's
// `peter-evans/create-pull-request` step; this script is read-only
// on disk so a failed `fetch` can't corrupt the working tree.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(root, "scripts", "secret-scan.mjs");
const REPO = "gitleaks/gitleaks";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

function extractCurrent(source) {
  // Match `const GITLEAKS_VERSION = "X.Y.Z";` — the literal line the
  // secret-scan.mjs file ships. We only need the version, not the
  // rest of the file.
  const match = source.match(/const GITLEAKS_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(
      "Could not find `const GITLEAKS_VERSION = \"…\";` in scripts/secret-scan.mjs"
    );
  }
  return match[1];
}

async function fetchLatest() {
  const res = await fetch(API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  // `tag_name` is `vX.Y.Z`; strip the leading `v`. Skip prereleases
  // (anything containing a hyphen suffix like `-rc1`, `-beta2`).
  const tag = json.tag_name ?? "";
  const version = tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Latest release tag "${tag}" did not parse as X.Y.Z — refusing to bump`
    );
  }
  if (json.prerelease === true) {
    throw new Error(
      `Latest release ${version} is marked prerelease — refusing to bump`
    );
  }
  return { version, releaseUrl: json.html_url, publishedAt: json.published_at };
}

async function main() {
  const source = readFileSync(scriptPath, "utf8");
  const current = extractCurrent(source);
  let latest;
  try {
    latest = await fetchLatest();
  } catch (err) {
    // Surface as a workflow-visible failure (the step exits non-zero
    // and the run shows the error), but include the current value so
    // debugging is easier.
    process.stderr.write(`[gitleaks-bump] ${err.message}\n`);
    process.stderr.write(`[gitleaks-bump] current pinned version: ${current}\n`);
    process.exit(1);
  }
  const report = {
    current,
    latest: latest.version,
    releaseUrl: latest.releaseUrl,
    publishedAt: latest.publishedAt,
    changed: current !== latest.version,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch(err => {
  process.stderr.write(`[gitleaks-bump] unexpected error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
