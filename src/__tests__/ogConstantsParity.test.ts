import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// EMPTY_PNG_BASE64 is duplicated: the TS app path
// (src/utils/ogConstants.ts, imported by postOgImage.ts) and the plain-node
// scripts path (scripts/ogConstants.mjs, imported by scripts/check-og.mjs,
// which cannot import the .ts). They MUST stay byte-identical or check-og
// validates dist output against a different fallback than the app emits.
// Read textually — importing the untyped .mjs would trip `astro check`.
const extractLiteral = (relPath: string): string => {
  const abs = fileURLToPath(new URL(relPath, import.meta.url));
  const src = readFileSync(abs, "utf8");
  const match = src.match(/EMPTY_PNG_BASE64\s*=\s*"([^"]+)"/);
  if (!match)
    throw new Error(`EMPTY_PNG_BASE64 literal not found in ${relPath}`);
  return match[1];
};

describe("EMPTY_PNG_BASE64 parity", () => {
  it("stays identical between ogConstants.ts and ogConstants.mjs", () => {
    const fromTs = extractLiteral("../utils/ogConstants.ts");
    const fromMjs = extractLiteral("../../scripts/ogConstants.mjs");
    expect(fromMjs).toBe(fromTs);
  });
});
