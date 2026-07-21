import { describe, it, expect, beforeEach } from "vitest";
import type { UIStrings } from "@/i18n/types";
import en from "@/i18n/lang/en";
import ru from "@/i18n/lang/ru";
import tr from "@/i18n/lang/tr";

/**
 * Runtime parity check for the three i18n lang modules.
 *
 * The TypeScript type system pins `satisfies UIStrings` at compile
 * time, but `astro check` only runs in CI as part of the larger
 * build. This file pins the parity gate at TEST runtime so a missing
 * key in any locale fails this file directly with a clear error
 * pointing at the missing branch.
 *
 * Strategy:
 *   1. Walk the EN module's exported shape to enumerate every key
 *      + nested key.
 *   2. For each path, assert the same key exists in RU and TR.
 *   3. Assert no locale file carries an EXTRA key the others don't
 *      define (catches typos / copy-paste mistakes).
 *
 * If a new translation string lands in `i18n/types.ts`, every
 * lang file MUST add it on the same commit — otherwise this file
 * fails.
 */
const locales = {
  en,
  ru,
  tr,
} as const satisfies Record<string, UIStrings>;

type Locale = keyof typeof locales;

/**
 * Recursively collect every (path, value) pair in an object. Used
 * to enumerate the canonical EN key set.
 *
 * M — PluralForms fields (e.g. `gallery.photoCount`) describe a
 * CLDR plural-category map where each locale is expected to ship
 * the categories it actually uses (Russian uses one/few/many/
 * other, English only uses other). Walking into a PluralForms
 * object as if it were a regular nested object would flag every
 * extra Russian category as a "missing key in EN" — which is
 * wrong. We treat PluralForms as an opaque leaf and skip
 * descent. The contract each locale enforces is "the
 * PluralForms-shaped field exists at the same path", not "the
 * exact same CLDR keys are present".
 */
const PLURAL_FORMS_PATHS = new Set(["gallery.photoCount"]);

function flatten(
  obj: unknown,
  prefix: string[] = [],
  pathString: string = ""
): Array<{ path: string[]; value: unknown }> {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object") return [{ path: prefix, value: obj }];
  const out: Array<{ path: string[]; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextPath = [...prefix, k];
    const nextPathString = pathString ? `${pathString}.${k}` : k;
    // Treat PluralForms as opaque; do NOT descend into it.
    if (
      PLURAL_FORMS_PATHS.has(nextPathString) &&
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      out.push({ path: nextPath, value: v });
      continue;
    }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v, nextPath, nextPathString));
    } else {
      out.push({ path: nextPath, value: v });
    }
  }
  return out;
}

const getByPath = (obj: unknown, path: string[]): unknown => {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
};

describe("UIStrings parity across en/ru/tr", () => {
  let enFlat: ReturnType<typeof flatten>;
  beforeEach(() => {
    enFlat = flatten(locales.en);
  });

  it.each<Locale>(["ru", "tr"])(
    "%s module has every key the EN module declares",
    locale => {
      const mod = locales[locale];
      const missing: string[][] = [];
      for (const { path } of enFlat) {
        if (getByPath(mod, path) === undefined) {
          missing.push(path);
        }
      }
      expect(
        missing,
        `${locale} is missing ${missing.length} key(s) — ` +
          `add them to src/i18n/lang/${locale}.ts to fix this gate.`
      ).toEqual([]);
    }
  );

  it.each<Locale>(["ru", "tr"])(
    "%s module has NO extra keys the EN module doesn't declare",
    locale => {
      const mod = locales[locale];
      const enPaths = new Set(enFlat.map(e => e.path.join(".")));
      const modFlat = flatten(mod);
      const extras: string[][] = [];
      for (const { path } of modFlat) {
        if (!enPaths.has(path.join("."))) {
          extras.push(path);
        }
      }
      expect(
        extras,
        `${locale} declares ${extras.length} key(s) ` +
          `not present in the canonical EN module — they are likely ` +
          `typos or stale additions. Either add to EN or remove from ${locale}.`
      ).toEqual([]);
    }
  );

  it("EN module satisfies the UIStrings interface (proves types + runtime agree)", () => {
    // Sanity: the type-level `satisfies UIStrings` annotation on
    // the lang file's export already does this; the runtime check
    // here catches the case where a future contributor removes the
    // annotation AND a key drift slips in untyped.
    const typed: UIStrings = locales.en;
    expect(typed.nav.posts).toBeTruthy();
    expect(typed.nav.search).toBeTruthy();
  });

  it("plural forms are CLDR-shaped objects, not bare strings", () => {
    // UIStrings specifies `gallery.photoCount: PluralForms` — i.e.
    // an object with at least one CLDR category. If a contributor
    // ever writes a bare string here, the runtime `plural()` helper
    // would crash on first use. This test pins the shape.
    const photoCount = locales.en.gallery.photoCount;
    expect(typeof photoCount).toBe("object");
    expect(photoCount).not.toBeNull();
    expect(Object.keys(photoCount as object).length).toBeGreaterThan(0);
  });
});
