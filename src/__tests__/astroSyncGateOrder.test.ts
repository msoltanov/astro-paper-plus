import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `astro sync` now runs only as the `postinstall` hook (see
 * `package.json:30`), so the explicit `astro sync` step is gone from
 * both `scripts/gate.mjs` and `.github/workflows/ci.yml`. `pnpm install`
 * triggers it for any clean checkout or CI run, so a separate step
 * before `astro check` is no longer needed.
 *
 * These tests pin the consolidation invariant: a future contributor
 * who re-introduces a duplicate `astro sync` step in either surface
 * should be redirected to the postinstall hook (single source of
 * truth) by these tests failing.
 */

const gateSrc = readFileSync(
  join(import.meta.dirname, "..", "..", "scripts", "gate.mjs"),
  "utf8"
);
const ciSrc = readFileSync(
  join(import.meta.dirname, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8"
);
const packageJson = readFileSync(
  join(import.meta.dirname, "..", "..", "package.json"),
  "utf8"
);

/**
 * Extract the array of step names from `gate.mjs`.
 */
const gateStepNames: string[] = (() => {
  const out: string[] = [];
  const re = /name:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(gateSrc)) !== null) {
    out.push(m[1]!);
  }
  return out;
})();

describe("issues.md #18 — astro sync consolidation", () => {
  it("package.json keeps `postinstall: astro sync` as the single source of truth", () => {
    expect(packageJson).toMatch(/"postinstall":\s*"astro sync"/);
  });

  it("scripts/gate.mjs does NOT declare a duplicate `astro sync` step", () => {
    expect(gateStepNames).not.toContain("astro sync");
  });

  it(".github/workflows/ci.yml does NOT run `pnpm exec astro sync` explicitly", () => {
    expect(ciSrc).not.toMatch(/run:\s*pnpm exec astro sync/);
  });
});
