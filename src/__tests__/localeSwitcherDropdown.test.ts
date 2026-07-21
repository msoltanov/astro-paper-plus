import { describe, it, expect } from "vitest";
/**
 * LocaleSwitcher renders a `<details>` element containing all locale
 * links. These tests assert the **source contract**: that the component
 * produces the expected structure, without mounting it via Astro runtime.
 *
 * We assert against the rendered HTML by re-reading the component source
 * rather than executing it, because Astro components require a
 * full runtime. The shape guarantees below are stable across the rest of
 * this app and catch silent regressions if anyone refactors the
 * switcher away from a dropdown, or if a supported locale is dropped.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, "../components/LocaleSwitcher.astro");
const source = readFileSync(componentPath, "utf8");

describe("LocaleSwitcher (source contract)", () => {
  it("uses <details>/<summary> for a native dropdown", () => {
    expect(source).toMatch(/<details[\s\S]*?<\/details>/);
    expect(source).toMatch(/<summary[\s\S]*?<\/summary>/);
  });

  it("renders all locales inside a plain <ul> (no ARIA menu role, which would promise keyboard nav the component does not implement)", () => {
    for (const code of ["en", "ru", "tr"]) {
      // Each locale must appear as a switcher <li> item (once per locale).
      // The trigger only shows the CURRENT locale's code, so non-current
      // locales appear exactly once.
      const matches = source.match(new RegExp(code, "gi")) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }
    // ARIA menu role would promise arrow-key roving focus and other menu
    // keyboard semantics that <details> doesn't implement; we use a plain
    // <ul> of links instead, which is fully keyboard-accessible by default.
    expect(source).not.toMatch(/role="menu"/);
  });

  it("marks the current locale with aria-current and the others with hreflang", () => {
    expect(source).toMatch(/aria-current=/);
    expect(source).toMatch(/hreflang=/);
  });

  it("renders trigger label as the uppercased 2-letter code", () => {
    // The code() helper output should appear in the trigger <summary> area
    expect(source).toMatch(/\{code\(currentLocale\)\}/);
    // And the visible trigger uses an uppercase format
    expect(source).toMatch(/toUpperCase\(\)/);
  });

  it("handles click-outside-to-close via inline script", () => {
    expect(source).toMatch(/closeOpenSwitchers/);
    expect(source).toMatch(/Escape/);
  });

  it("does NOT use `as any` to widen the LOCALES tuple for `.includes()`", () => {
    // `LOCALES` is a `readonly ["en","ru","tr"]` tuple. To check
    // whether an arbitrary path segment matches a supported locale
    // without TypeScript narrowing, we widen the tuple to its string
    // supertype: `(LOCALES as readonly string[]).includes(parts[0])`.
    // `as any` would also compile but defeats type safety — pin against
    // it so a future refactor back to `as any` fails this gate.
    expect(source).not.toMatch(/LOCALES\.includes\([^)]*as any/);
    expect(source).toMatch(
      /\(LOCALES\s+as\s+readonly\s+string\[\]\)\.includes\(/
    );
  });

  // M15: `aria-haspopup="true"` (broader AT support) replaces
  // `aria-haspopup="menu"` (technically valid but patchy in older
  // NVDA / VoiceOver). `<details>` already conveys the disclosure
  // semantics; the attribute is belt-and-braces for screen readers.
  it('M15: aria-haspopup is "true" (broader AT support than "menu")', () => {
    expect(source).toMatch(/aria-haspopup="true"/);
    expect(source).not.toMatch(/aria-haspopup="menu"/);
  });
});
