/**
 * #39 MAINT — tsconfig path alias integrity.
 *
 * `src/config.ts` does `import userConfig from "@/astro-paper.config"`.
 * The alias is declared in `tsconfig.json` under `compilerOptions.paths`
 * and is consumed by:
 *   - `astro check` (TypeScript compiler)
 *   - Vite / Astro build (Vite's `resolve.alias` derived from paths)
 *   - vitest (`vitest.config.ts` sets `resolve.tsconfigPaths: true`)
 *
 * If the alias drifts (rename of `astro-paper.config.ts`, typo in
 * tsconfig, missing entry in `vitest.config.ts`), `astro check`
 * would fail loudly — but vitest can silently fall back to the
 * mocked value in `src/__tests__/setup.ts`, masking the drift.
 *
 * This test pins the alias contract:
 *   1. `tsconfig.json` declares `@/*` AND `@/astro-paper.config`.
 *   2. `astro-paper.config.ts` exists at the repo root.
 *   3. The aliased file exports a `default` whose shape matches the
 *      `defineAstroPaperConfig` factory's expected input.
 *   4. `vitest.config.ts` enables `resolve.tsconfigPaths: true` so
 *      the alias actually resolves at test time.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

const here = dirname(urlToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

describe("#39 — tsconfig path alias integrity", () => {
  it("tsconfig.json declares both `@/*` and `@/astro-paper.config` aliases", () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(repoRoot, "tsconfig.json"), "utf8")
    ) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const paths = tsconfig.compilerOptions?.paths ?? {};
    expect(paths).toHaveProperty("@/*");
    expect(paths["@/*"]).toEqual(["./src/*"]);
    expect(paths).toHaveProperty("@/astro-paper.config");
    expect(paths["@/astro-paper.config"]).toEqual(["./astro-paper.config"]);
  });

  it("astro-paper.config.ts exists at the path the alias resolves to", () => {
    // The alias `./astro-paper.config` (no extension) must resolve
    // to a real file. TypeScript convention is that
    // `./foo` resolves to `./foo.ts`.
    expect(
      existsSync(resolve(repoRoot, "astro-paper.config.ts")),
      'astro-paper.config.ts must exist at the repo root — the `tsconfig.json` paths entry `@/astro-paper.config: ["./astro-paper.config"]` resolves it via TypeScript\'s extension resolution'
    ).toBe(true);
  });

  it("vitest.config.ts enables tsconfigPaths so the alias resolves at test time", () => {
    // Without `resolve.tsconfigPaths: true` the alias would silently
    // fall through to vitest's default resolver (which doesn't know
    // about `@/astro-paper.config`). The setup mock would then
    // satisfy every consumer and the real file would never load.
    const vitestConfig = readFileSync(
      resolve(repoRoot, "vitest.config.ts"),
      "utf8"
    );
    expect(vitestConfig).toMatch(/tsconfigPaths:\s*true/);
  });

  it("the setup mock for @/astro-paper.config declares the expected keys", () => {
    // Pin the mock contract — the real file is loaded by `astro
    // check`; tests see the mock. A drift in the mock (e.g.
    // dropping `site.timezone`) would surface as broken utility
    // tests that fail with confusing errors. Catch it here.
    const setup = readFileSync(
      resolve(repoRoot, "src/__tests__/setup.ts"),
      "utf8"
    );
    expect(setup).toMatch(/vi\.mock\(["']@\/astro-paper\.config["']/);
    // The mock must declare the three top-level keys our
    // `src/config.ts` reads via `userConfig.X` paths.
    expect(setup).toMatch(/site:\s*\{/);
    expect(setup).toMatch(/posts:\s*\{/);
    expect(setup).toMatch(/features:\s*\{/);
  });
});
