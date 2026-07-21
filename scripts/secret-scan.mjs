#!/usr/bin/env node
/**
 * `secret-scan.mjs` — reproducible gitleaks runner for AstroPaper+.
 *
 * Wraps the gitleaks secret scanner so the "no leaked secrets" claim
 * is verifiable end-to-end from a clean checkout with one command:
 *
 *     pnpm secret:scan
 *
 * Behaviour
 * ---------
 * 1. If `gitleaks` is on `PATH`, use it directly.
 * 2. Otherwise, download the latest gitleaks release for the
 *    current platform (linux/darwin/windows × amd64/arm64) from
 *    https://github.com/gitleaks/gitleaks/releases, cache the
 *    extracted binary in `.cache/gitleaks/gitleaks-<version><.exe>`,
 *    and run it. The pinned version is part of the cache path, so
 *    bumping `GITLEAKS_VERSION` automatically invalidates older
 *    binaries left on disk.
 * 3. Run `gitleaks detect --source .` to scan git history and the
 *    working tree together. Exit 0 on clean, exit 1 on findings.
 *
 * Notes
 * -----
 * - The cache directory is `.cache/gitleaks/` at the repo root.
 *   Add it to `.gitignore` (the script creates it lazily).
 * - gitleaks is platform-specific. The script picks the right
 *   asset name from a small map of `platform → asset suffix`.
 * - The default scan covers both git history AND the working
 *   tree. Pass `GITLEAKS_ARGS` to add extra flags
 *   (e.g. `GITLEAKS_ARGS=--no-git pnpm secret:scan`).
 * - `--no-banner -v` is always added so the run is self-documenting
 *   in CI logs.
 */
import { spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CACHE_DIR = join(REPO_ROOT, ".cache", "gitleaks");
// Pinned gitleaks release. Bump here on each update; add a Renovate /
// Dependabot follow-up to keep it fresh. The wrapper downloads the
// pinned asset on first run and verifies its SHA-256 against the
// upstream `*_checksums.txt` — so a wrong version number fails loud
// at scan time rather than silently scanning with a stale regex set.
const GITLEAKS_VERSION = "8.27.0";

// ─── Platform detection ────────────────────────────────────────────────

const PLATFORM_ASSET = {
  "linux-x64": `gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz`,
  "linux-arm64": `gitleaks_${GITLEAKS_VERSION}_linux_arm64.tar.gz`,
  "darwin-x64": `gitleaks_${GITLEAKS_VERSION}_darwin_x64.tar.gz`,
  "darwin-arm64": `gitleaks_${GITLEAKS_VERSION}_darwin_arm64.tar.gz`,
  "win32-x64": `gitleaks_${GITLEAKS_VERSION}_windows_x64.zip`,
};

function platformKey() {
  const arch =
    process.arch === "x64"
      ? "x64"
      : process.arch === "arm64"
        ? "arm64"
        : null;
  if (!arch) return null;
  if (process.platform === "linux") return `linux-${arch}`;
  if (process.platform === "darwin") return `darwin-${arch}`;
  if (process.platform === "win32") return `win32-${arch}`;
  return null;
}

const EXT = process.platform === "win32" ? ".exe" : "";

// ─── Cached binary path ────────────────────────────────────────────────
//
// The cached binary lives at `.cache/gitleaks/gitleaks-<version><.exe>`
// (NOT just `gitleaks`). Including the pinned version in the path
// means bumping `GITLEAKS_VERSION` automatically invalidates any
// older binary already on disk — a previous regression kept reusing
// gitleaks 8.18.4 from a previous version of this file because the
// versionless `gitleaks` path always satisfied `isCached()`. Stamping
// the version onto the path makes the invalidation structural.

function cachedBinaryPath() {
  return join(CACHE_DIR, `gitleaks-${GITLEAKS_VERSION}${EXT}`);
}

function isCached() {
  const p = cachedBinaryPath();
  if (!existsSync(p)) return false;
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// Read the cached binary's reported version via `gitleaks version`.
// Returns the parsed semver string (e.g. "8.27.0"), or null on any
// failure (binary missing, non-zero exit, unparsable output). The
// PATH-resolved branch never calls this — for system gitleaks we
// trust the user's install.
async function readCachedVersion() {
  const p = cachedBinaryPath();
  if (!existsSync(p)) return null;
  const result = spawnSync(p, ["version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  const text = (result.stdout || result.stderr || "").trim();
  // gitleaks prints e.g. `8.27.0`. Match the first dotted-triple.
  const match = text.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

// True if a cached binary exists AND reports the pinned version.
// Versioned path alone already covers the regression: a stale
// `gitleaks-8.18.4` left in `.cache/` will never be picked up by a
// `GITLEAKS_VERSION = "8.27.0"` run, because the latter looks for
// `gitleaks-8.27.0`. The version probe is belt-and-suspenders for
// shared checkouts (worktrees, parallel CI) where one branch's
// binary could land on a path the other branch's version expects.
async function isUsableCached() {
  if (!isCached()) return false;
  const reported = await readCachedVersion();
  return reported === GITLEAKS_VERSION;
}

// ─── 1. PATH lookup ────────────────────────────────────────────────────

function findOnPath() {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["gitleaks"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
  );
  if (result.status === 0) {
    const line = result.stdout.split(/\r?\n/)[0]?.trim();
    if (line) return line;
  }
  return null;
}

export function checksumForAsset(checksums, asset) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match?.[2] === asset) return match[1].toLowerCase();
  }
  throw new Error(`[secret-scan] checksum not found for ${asset}.`);
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function assertMatchingChecksum(asset, expected, actual) {
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(actual, "hex");
  if (
    expectedBytes.length !== 32 ||
    actualBytes.length !== 32 ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    throw new Error(
      `[secret-scan] SHA-256 mismatch for ${asset}: expected ${expected}, got ${actual}.`
    );
  }
}

/**
 * Build the `tar` argv for extracting the single `gitleaks` member
 * into `cacheDir`.
 *
 * ORDER IS LOAD-BEARING: `-C` must come BEFORE the member name.
 * GNU tar documents `-C` as order-sensitive ("affects all options
 * that follow"), so `-xzf <archive> gitleaks -C <dir>` extracts
 * `gitleaks` relative to the CWD and the `-C` applies to nothing —
 * and GNU tar still exits 0, so the failure is silent. That shipped
 * for a while: the binary landed in the repo root, `.cache/gitleaks/`
 * stayed empty, and the run died at the `existsSync` check below.
 * bsdtar (Windows/macOS) instead reads `-C` as a member name and
 * errors, so the bug was invisible on Windows — which only ever
 * takes the `.zip` branch anyway.
 */
export function tarExtractArgs(archivePath, cacheDir, member = "gitleaks") {
  return ["-xzf", archivePath, "-C", cacheDir, member];
}

// ─── 2. Download + extract ─────────────────────────────────────────────

async function downloadAndInstall() {
  const key = platformKey();
  if (!key || !PLATFORM_ASSET[key]) {
    throw new Error(
      `[secret-scan] no gitleaks release asset for ${process.platform}/${process.arch}. ` +
        `Supported: ${Object.keys(PLATFORM_ASSET).join(", ")}. ` +
        `Install gitleaks manually from https://github.com/gitleaks/gitleaks/releases and ensure it's on PATH.`
    );
  }

  const asset = PLATFORM_ASSET[key];
  const releaseBase = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}`;
  const url = `${releaseBase}/${asset}`;
  const checksumsAsset = `gitleaks_${GITLEAKS_VERSION}_checksums.txt`;
  const checksumsUrl = `${releaseBase}/${checksumsAsset}`;
  const archivePath = join(tmpdir(), asset);

  mkdirSync(CACHE_DIR, { recursive: true });
  process.stdout.write(`[secret-scan] downloading ${asset} …\n`);
  process.stdout.write(`[secret-scan]   from ${url}\n`);

  const [res, checksumsRes] = await Promise.all([
    fetch(url, { redirect: "follow" }),
    fetch(checksumsUrl, { redirect: "follow" }),
  ]);
  if (!res.ok) {
    throw new Error(
      `[secret-scan] download failed: HTTP ${res.status} ${res.statusText}. ` +
        `Check your network or install gitleaks manually.`
    );
  }
  if (!checksumsRes.ok) {
    throw new Error(
      `[secret-scan] checksum download failed: HTTP ${checksumsRes.status} ${checksumsRes.statusText}.`
    );
  }
  if (!res.body) {
    throw new Error(`[secret-scan] download failed: empty response body.`);
  }

  const checksums = await checksumsRes.text();
  const expectedChecksum = checksumForAsset(checksums, asset);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archivePath));
  const actualChecksum = await sha256File(archivePath);
  try {
    assertMatchingChecksum(asset, expectedChecksum, actualChecksum);
  } catch (error) {
    try {
      unlinkSync(archivePath);
    } catch {}
    throw error;
  }
  process.stdout.write(`[secret-scan] SHA-256 verified: ${actualChecksum}\n`);

  process.stdout.write(`[secret-scan] extracting …\n`);
  if (asset.endsWith(".tar.gz")) {
    const untar = spawnSync("tar", tarExtractArgs(archivePath, CACHE_DIR), {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (untar.status !== 0) {
      throw new Error(`[secret-scan] tar extract failed (status ${untar.status}).`);
    }
  } else if (asset.endsWith(".zip")) {
    // `unzip` is not on PATH on a clean Windows install by default,
    // so use PowerShell's `Expand-Archive` for portability.
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${CACHE_DIR}" -Force`,
      ],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    if (ps.status !== 0) {
      throw new Error(
        `[secret-scan] zip extract failed (status ${ps.status}). ` +
          `Install gitleaks manually and put it on PATH.`
      );
    }
  } else {
    throw new Error(`[secret-scan] unknown archive format for ${asset}.`);
  }

  // Clean up the downloaded archive; we only keep the extracted binary.
  try {
    unlinkSync(archivePath);
  } catch {
    // best-effort
  }

  // The archive extracts gitleaks as a bare `gitleaks` (or
  // `gitleaks.exe` on Windows) file with no version in its name —
  // rename to the version-stamped cache path so a version bump
  // doesn't pick up the wrong binary. The `existsSync` check below
  // fails loud if the upstream asset layout changes (e.g. a future
  // release starts shipping `gitleaks-v8.27.0` instead of `gitleaks`).
  const binary = cachedBinaryPath();
  const extractedName = `gitleaks${EXT}`;
  const extractedPath = join(CACHE_DIR, extractedName);
  if (!existsSync(extractedPath)) {
    throw new Error(
      `[secret-scan] expected ${extractedName} at ${extractedPath} after extraction but it wasn't there. ` +
        `Asset layout may have changed — check https://github.com/gitleaks/gitleaks/releases.`
    );
  }
  // Best-effort: any pre-existing binary at the versioned path is
  // overwritten by the new download. If `rename` fails (e.g. on
  // Windows when the destination is locked), fall back to copy +
  // unlink so the version-stamped path is always populated.
  try {
    renameSync(extractedPath, binary);
  } catch {
    try {
      copyFileSync(extractedPath, binary);
      unlinkSync(extractedPath);
    } catch (renameError) {
      throw new Error(
        `[secret-scan] could not stage cached binary at ${binary}: ${renameError.message}`
      );
    }
  }

  // gitleaks' distribution ships a README.md full of test fixtures
  // (deliberately fake AWS keys, sidekiq secrets, etc.) used in the
  // project's own CI. Leaving it in the cache means a working-tree
  // scan flags 4+ false positives every run. Delete it after
  // extraction; the binary is the only thing we actually need.
  // `readdirSync` + `unlinkSync` rather than glob — keeps the script
  // dependency-free. We only sweep siblings of the versioned binary
  // path so an older-version binary left on disk by a prior
  // `GITLEAKS_VERSION` is preserved (not silently reaped by the
  // current run).
  for (const entry of readdirSync(CACHE_DIR)) {
    if (entry === `gitleaks-${GITLEAKS_VERSION}${EXT}`) continue;
    try {
      unlinkSync(join(CACHE_DIR, entry));
    } catch {
      // best-effort; the only entries that should be here are the
      // binary and gitleaks' accompanying README/CHANGELOG/LICENSE.
    }
  }

  if (process.platform !== "win32") {
    chmodSync(binary, 0o755);
  }
  return binary;
}

// ─── Run ───────────────────────────────────────────────────────────────

async function main() {
  let binary = findOnPath();
  if (binary) {
    process.stdout.write(`[secret-scan] using gitleaks from PATH: ${binary}\n`);
  } else if (await isUsableCached()) {
    binary = cachedBinaryPath();
    process.stdout.write(
      `[secret-scan] using cached gitleaks ${GITLEAKS_VERSION} at ${binary}\n`
    );
  } else {
    binary = await downloadAndInstall();
    process.stdout.write(`[secret-scan] installed gitleaks to ${binary}\n`);
  }

  // Report version (best-effort; gitleaks prints it on `-v` or first
  // run with --no-banner). Use a separate spawn that won't fail the
  // outer run on stdout-stripped versions.
  const versionResult = spawnSync(binary, ["version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const version =
    (versionResult.stdout || versionResult.stderr || "").trim() ||
    `gitleaks (version probe failed; status=${versionResult.status})`;
  process.stdout.write(`[secret-scan] version: ${version}\n`);

  // Build the scan args. Default = scan git history AND working tree
  // by running two explicit passes (issues.md P0-4: the previous
  // single-shot only did one or the other depending on context).
  // `GITLEAKS_ARGS` is preserved for ad-hoc overrides (e.g. CI
  // debugging). `--config` is always passed so the project's
  // `.gitleaks.toml` allowlist (excluding dist/, .cache/,
  // node_modules/, etc.) is picked up regardless of the user's CWD.
  const extraArgs = (process.env.GITLEAKS_ARGS ?? "").trim();
  const configPath = join(REPO_ROOT, ".gitleaks.toml");
  const baseArgs = ["detect", "--source", ".", "--config", configPath, "--no-banner", "-v"];
  if (extraArgs) {
    baseArgs.push(...extraArgs.split(/\s+/).filter(Boolean));
  }

  // Two complementary passes:
  //   1. git mode (default `gitleaks detect`)        -> history
  //   2. `--no-git` mode                            -> working tree
  // Either pass reporting findings fails the whole run.
  const gitArgs = baseArgs;
  const workingTreeArgs = ["detect", "--source", ".", "--config", configPath, "--no-git", "--no-banner", "-v"];
  if (extraArgs) {
    workingTreeArgs.push(...extraArgs.split(/\s+/).filter(Boolean));
  }

  process.stdout.write(`[secret-scan] running: ${binary} ${gitArgs.join(" ")}\n`);
  const gitResult = spawnSync(binary, gitArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    encoding: "utf-8",
  });

  process.stdout.write(`[secret-scan] running: ${binary} ${workingTreeArgs.join(" ")}\n`);
  const workingTreeResult = spawnSync(binary, workingTreeArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    encoding: "utf-8",
  });

  const gitClean = gitResult.status === 0;
  const workingTreeClean = workingTreeResult.status === 0;

  if (gitClean && workingTreeClean) {
    process.stdout.write(
      `[secret-scan] clean — no leaks in git history + working tree${
        extraArgs ? ` (extraArgs: ${extraArgs})` : ""
      }.\n`
    );
    process.exit(0);
  }

  const failing = [];
  if (!gitClean) failing.push("git history");
  if (!workingTreeClean) failing.push("working tree");
  process.stderr.write(
    `[secret-scan] FAILED — leak(s) detected in: ${failing.join(", ")}. ` +
      `See output above for findings.\n`
  );
  // Use the worst exit code observed, falling back to 1.
  const lastNonZero = [gitResult.status, workingTreeResult.status]
    .filter((s) => typeof s === "number" && s !== 0)
    .pop();
  process.exit(lastNonZero ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    process.stderr.write(
      `[secret-scan] ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  });
}
