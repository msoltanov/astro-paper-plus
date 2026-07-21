import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const BUMP_SCRIPT_PATH = resolve("scripts/gitleaks-bump.mjs");
const SCAN_SCRIPT_PATH = resolve("scripts/secret-scan.mjs");
const CI_WORKFLOW_PATH = resolve(".github/workflows/ci.yml");
const BUMP_WORKFLOW_PATH = resolve(".github/workflows/gitleaks-bump.yml");

describe("gitleaks bump bot", () => {
  it('parses the `const GITLEAKS_VERSION = "X.Y.Z";` literal from the scan script', () => {
    // The bump bot's source-of-truth is the literal in
    // `scripts/secret-scan.mjs`. This test pins the regex the
    // bump script uses to extract that literal — if someone
    // refactors the scan script and the regex no longer matches,
    // the bump bot breaks silently (it would `throw` and the
    // workflow step would fail, but the failure mode is opaque).
    // A structural check here is a one-line defense.
    const bumpSource = readFileSync(BUMP_SCRIPT_PATH, "utf8");
    // The exact regex the script uses to extract the version.
    // Written as a string so the escaping is unambiguous.
    const expected = 'source.match(/const GITLEAKS_VERSION\\s*=\\s*"([^"]+)"/)';
    expect(bumpSource).toContain(expected);
  });

  it("rejects prerelease / malformed tags", () => {
    // The bump bot's `fetchLatest()` parses `tag_name` and rejects
    // anything that isn't `X.Y.Z` or that the GitHub release
    // object flags as `prerelease: true`. A regression that lets
    // `-rc1` versions slip through would push unreleased gitleaks
    // rules into CI and risk false positives.
    const bumpSource = readFileSync(BUMP_SCRIPT_PATH, "utf8");
    // X.Y.Z parse gate.
    expect(bumpSource).toContain("if (!/^\\d+\\.\\d+\\.\\d+$/.test(version))");
    // prerelease gate.
    expect(bumpSource).toContain("if (json.prerelease === true)");
  });

  it("only edits scripts/secret-scan.mjs in the bump PR", () => {
    // `peter-evans/create-pull-request` honours `add-paths` to
    // scope which file changes go into the commit. A regression
    // that drops `add-paths` (or widens it) would have the bump
    // bot commit unrelated diff noise — or, worse, fail to commit
    // the version bump at all.
    const workflow = readFileSync(BUMP_WORKFLOW_PATH, "utf8");
    expect(workflow).toMatch(/add-paths:\s*scripts\/secret-scan\.mjs/);
  });

  it("CI reads the gitleaks version from the scan script (single source of truth)", () => {
    // Before this fix, `GITLEAKS_VERSION` was duplicated between
    // `scripts/secret-scan.mjs` (the `const` the script actually
    // uses) and `.github/workflows/ci.yml` (the `env` used as the
    // `actions/cache` key). A bump that only edited the script
    // would leave the cache key stale, so runners would download
    // the new release every CI run. The CI now greps the value
    // out of the script at workflow start, so the bump bot's
    // single edit keeps both call sites in sync.
    const ci = readFileSync(CI_WORKFLOW_PATH, "utf8");
    // The hardcoded literal value `"X.Y.Z"` must NOT appear
    // anywhere in the CI file (it would mean someone
    // re-introduced the duplication). The trailing `:` makes
    // the match specific to a YAML `key: value` pair, not the
    // `GITLEAKS_VERSION=` Bash-extraction line that does the
    // grep.
    expect(ci).not.toMatch(/GITLEAKS_VERSION:\s*"[\d.]+"/);
    // The CI must contain a step that pulls the version from the
    // script. We don't pin the exact bash incantation (a future
    // refactor to a `jq` filter shouldn't break this test), just
    // the structural contract: a step output named `version` and
    // a `node -p` (or equivalent) call that reads the file.
    expect(ci).toContain("steps.version.outputs.version");
    expect(ci).toContain("node -p");
    expect(ci).toContain("scripts/secret-scan.mjs");
  });

  it('the scan script still has the literal `const GITLEAKS_VERSION = "…";` (the bump bot\'s source of truth)', () => {
    // Belt-and-braces: if someone renames the constant, both the
    // bump bot and the CI's grep would silently miss it. This
    // test fails the build before that can ship.
    const source = readFileSync(SCAN_SCRIPT_PATH, "utf8");
    const match = source.match(/const GITLEAKS_VERSION\s*=\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    // The pinned version should be a semver-shaped string. We
    // don't pin the value (the bump bot owns that), but we do
    // require the shape to be valid.
    expect(match?.[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
