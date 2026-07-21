import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/ExternalLink.astro", "utf8");

describe("ExternalLink accessible-name contract", () => {
  it("keeps the visible slot and opening hint for links without aria-label", () => {
    expect(source).toMatch(/<slot\s*\/?>\s*<span class=\"sr-only\">/);
    expect(source).toMatch(/t\.link\.opensInNewTab/);
  });

  it("uses the caller label as the accessible name while retaining the opening hint", () => {
    expect(source).toMatch(/const announcedLabel = ariaLabel/);
    expect(source).toMatch(/aria-label=\{announcedLabel\}/);
    expect(source).toMatch(/\$\{ariaLabel\} \(\$\{t\.link\.opensInNewTab\}\)/);
  });
});
