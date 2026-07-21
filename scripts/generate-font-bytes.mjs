#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * generate-font-bytes.mjs — encode the vendored TTF font files from
 * `src/assets/fonts/` into `src/utils/fontBytes.generated.ts` so the
 * OG image pipeline can ship the bytes inside the Astro bundle
 * without depending on a runtime filesystem path.
 *
 * Background
 * ----------
 * The previous implementation (`src/utils/postOgImage.ts`) computed
 * font paths via `new URL("../assets/fonts/X.ttf", import.meta.url)`,
 * which resolves correctly in dev / vitest (where `import.meta.url`
 * points at `src/utils/postOgImage.ts`) but BREAKS in `astro build`'s
 * prerender output: each endpoint bundle is emitted under
 * `dist/.prerender/chunks/`, and the relative URL resolves to
 * `dist/.prerender/assets/fonts/X.ttf`, which doesn't exist (the
 * vendored TTFs are not copied by Vite's asset pipeline because
 * `readFileSync` is the consumer, not an `import`).
 *
 * The fix bundles the bytes into the prerender chunk as a generated
 * TypeScript module exporting two `Uint8Array` constants. The
 * constants are decoded lazily + memoised in `postOgImage.ts` so the
 * TS-source side cost is paid once per build.
 *
 * Run
 * ---
 *   node scripts/generate-font-bytes.mjs
 *
 * The script is idempotent: re-running it writes the same output if
 * the fonts are unchanged. `scripts/check-font-bytes.test.mjs`
 * (separate file — see T0-2 in issues.md) reads both the vendored
 * TTFs and the generated module and asserts parity, so the script
 * is wired into `pnpm test` rather than the build pipeline.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FONTS_DIR = join(ROOT, "src", "assets", "fonts");
const OUT_DIR = join(ROOT, "src", "utils");
const OUT_FILE = join(OUT_DIR, "fontBytes.generated.ts");

const REGULAR_PATH = join(FONTS_DIR, "GoogleSansCode-400-normal.ttf");
const BOLD_PATH = join(FONTS_DIR, "GoogleSansCode-700-normal.ttf");

function readTtfAsBase64(path) {
  const bytes = readFileSync(path);
  return bytes.toString("base64");
}

function headerLine() {
  return [
    "/**",
    " * THIS FILE IS GENERATED. DO NOT EDIT.",
    " * Regenerate via `node scripts/generate-font-bytes.mjs`.",
    " *",
    " * Embedded vendored TTF font bytes (base64-encoded) so the OG",
    " * image pipeline (`src/utils/postOgImage.ts`) can ship the bytes",
    " * inside the Astro prerender bundle without depending on a",
    " * runtime filesystem path. See issues.md T0-2 for context.",
    " *",
    " * Sources:",
    " *   - src/assets/fonts/GoogleSansCode-400-normal.ttf",
    " *   - src/assets/fonts/GoogleSansCode-700-normal.ttf",
    " */",
    "",
  ].join("\n");
}

function arrayBufferPair(name, base64) {
  const len = Buffer.from(base64, "base64").byteLength;
  const factoryName = "decode" + name;
  return [
    `function ${factoryName}() {`,
    `  // base64 -> ${len} bytes of vendored TTF data`,
    `  return Uint8Array.from(atob(${JSON.stringify(base64)}), (ch) => ch.charCodeAt(0)).buffer;`,
    `}`,
    ``,
    `export const FONT_${name}_BYTES: ArrayBuffer = ${factoryName}();`,
    ``,
  ].join("\n");
}

const regularB64 = readTtfAsBase64(REGULAR_PATH);
const boldB64 = readTtfAsBase64(BOLD_PATH);

mkdirSync(OUT_DIR, { recursive: true });

const out = [
  headerLine(),
  arrayBufferPair("REGULAR", regularB64),
  arrayBufferPair("BOLD", boldB64),
].join("\n");

writeFileSync(OUT_FILE, out, "utf8");

console.log(
  `[generate-font-bytes] wrote ${OUT_FILE} ` +
    `(regular: ${Buffer.from(regularB64, "base64").byteLength}B, ` +
    `bold: ${Buffer.from(boldB64, "base64").byteLength}B)`
);
