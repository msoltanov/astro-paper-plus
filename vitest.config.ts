/**
 * Vitest config — split between two projects so client scripts that
 * touch `window` / `document` / `MutationObserver` can run under a DOM
 * environment without forcing utility tests to boot one.
 *
 * - `utils`  — Node environment, matches the historic test setup. The
 *              `setup.ts` mocks Astro's virtual modules so utility
 *              code can be exercised without booting Astro.
 * - `dom`    — happy-dom environment for client script tests. Loads
 *              `setupDom.ts` which resets `document.documentElement`
 *              between cases (matches the `theme.ts` /
 *              `galleryLightbox.ts` / `mermaid.ts` behavioural tests
 *              that land here).
 *
 * Coverage config (P1-23): kept at the top level per Vitest 4's
 * workspace model. Coverage apply through test runs only when the
 * CLI flag `--coverage` is passed; the DOM project surfaces
 * (`src/scripts/**`) are excluded from the coverage include below
 * so even when the user runs `pnpm test:coverage` the DOM project's
 * happy-dom-driven scripts don't get counted against the thresholds.
 *
 * Run `pnpm test` (or `vitest run`) to execute both projects. Run
 * `vitest run --project utils` (or `dom`) to scope to one suite.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        resolve: { tsconfigPaths: true },
        test: {
          name: "utils",
          environment: "node",
          include: ["src/__tests__/*.test.ts"],
          exclude: ["src/__tests__/*.dom.test.ts"],
          setupFiles: ["./src/__tests__/setup.ts"],
        },
      },
      {
        extends: true,
        resolve: { tsconfigPaths: true },
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/__tests__/*.dom.test.ts"],
          setupFiles: ["./src/__tests__/setupDom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/utils/**",
        "src/i18n/**",
        "src/integrations/**",
        // P1-23: deliberately EXCLUDED — DOM-script coverage is
        // exercised by the `dom` project, not the `utils` one.
        // Including it here would double-count happy-dom-driven
        // `src/scripts/theme.ts` / `galleryLightbox.ts` / `mermaid.ts`
        // files that aren't part of the production bundle path.
        //
        // `src/scripts/**`,
        "src/types/**",
      ],
      exclude: [
        "src/utils/transformers/**",
        "src/**/*.d.ts",
        "src/**/types.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 78,
      },
    },
  },
});
