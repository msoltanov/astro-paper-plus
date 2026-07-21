import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * Regression guards for `src/scripts/mermaid.ts`.
 *
 * The script uses `node.innerHTML = result.svg` on the render result
 * (a `Result` from `mermaid.render(...)`). That assignment is only
 * safe because Mermaid is configured with `securityLevel: "strict"`
 * which guarantees the emitted SVG contains no executable script,
 * event handlers, or `<foreignObject>` content. If a future change
 * relaxes this setting, or Mermaid's defaults shift, the innerHTML
 * assignment becomes a stored-XSS surface. These tests pin the
 * current invariants.
 *
 * Reading the source as text (rather than importing `mermaid.ts`)
 * keeps the test resilient to its bundler-specific syntax — we only
 * care about the literal string contracts, not the runtime behavior.
 */
describe("mermaid security", () => {
  const source = readFileSync("src/scripts/mermaid.ts", "utf-8");

  it("initializes mermaid with securityLevel 'strict' as a literal in the initialize() call", () => {
    // Pin the EXACT option shape. The looser `/securityLevel:\s*["']strict["']/`
    // would also pass if someone set `securityLevel: "loose"` *elsewhere* in
    // the file (or in a comment) — both literals would be present and the
    // loose regex would still match. We anchor on the initialize() call so a
    // regression that simultaneously introduces "loose" elsewhere still fails
    // this test.
    expect(source).toMatch(
      /mermaid\.initialize\s*\(\s*\{[\s\S]*?securityLevel:\s*["']strict["']/
    );
    // Defence in depth: confirm "loose" is NOT a literal value anywhere in
    // the source. (A regression comment referencing "loose" would still pass
    // this test, but a literal that escaped into the runtime config would
    // not.)
    const looseMatches = source.match(/securityLevel:\s*["']loose["']/g) ?? [];
    expect(looseMatches).toHaveLength(0);
  });

  it("renders via DOMParser + replaceChildren (no innerHTML from mermaid output)", () => {
    // P1-8: the script used to assign `node.innerHTML = result.svg`
    // directly. That's the only usage in the five client scripts
    // that bypasses the browser's HTML-parser security; a future
    // config change relaxing `securityLevel: "strict"` would
    // re-open the script-injection vector. The fixed path parses
    // `result.svg` through `DOMParser` and uses `replaceChildren`
    // — same visible result, defense-in-depth against Mermaid
    // defaults shifting or a contributor changing the runtime
    // config.
    const innerHTMLWrites = source.match(/\.innerHTML\s*=/g) ?? [];
    expect(innerHTMLWrites).toHaveLength(0);
    expect(source).toMatch(/DOMParser\(\)\.parseFromString/);
    expect(source).toMatch(/node\.replaceChildren\(/);
  });

  it("never sets innerHTML from a raw user-provided source string", () => {
    // Defensive: any future code path that did `node.innerHTML = source`
    // would re-introduce the original XSS the strict level protects
    // against. Mermaid-escaped source goes through textContent, never
    // innerHTML.
    expect(source).not.toMatch(
      /innerHTML\s*=\s*(?:el\.dataset\.source|el\.textContent)/
    );
  });

  it("does not destructure or use `result.bindFunctions`", () => {
    // `bindFunctions` lets caller code attach click handlers to the SVG
    // callbacks. In strict mode this is a guaranteed no-op (handlers are
    // stripped before render), but the contract we want to pin is
    // "caller code never reads it" — if a regression starts destructuring
    // it (e.g. `const { svg, bindFunctions } = result; bindFunctions(node)`),
    // a future relaxation of `securityLevel` from "strict" would silently
    // re-attach user-derived handlers to an SVG that already went through
    // `innerHTML = ...`, recreating the XSS surface this test was written
    // to prevent.
    expect(source).not.toMatch(/bindFunctions\s*[=:.]/);
  });
});
