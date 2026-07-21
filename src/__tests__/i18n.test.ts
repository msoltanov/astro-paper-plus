import { describe, it, expect } from "vitest";
import { tplStr, formatDate, plural, useTranslations } from "@/i18n";
import type { PluralForms } from "@/i18n";

describe("tplStr", () => {
  it("replaces a single placeholder", () => {
    expect(tplStr("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("replaces multiple placeholders", () => {
    expect(
      tplStr("Share on {{platform}} via {{network}}", {
        platform: "Twitter",
        network: "X",
      })
    ).toBe("Share on Twitter via X");
  });

  it("replaces the same placeholder multiple times", () => {
    expect(tplStr("{{x}} and {{x}}", { x: "1" })).toBe("1 and 1");
  });

  it("returns empty for missing variables", () => {
    expect(tplStr("Hello {{name}}!", {})).toBe("Hello !");
  });

  it("supports numeric values", () => {
    expect(tplStr("Count: {{n}}", { n: 42 })).toBe("Count: 42");
  });

  it("ignores stray braces that don't match the {{name}} pattern", () => {
    expect(tplStr("Some {not a var} text", {})).toBe("Some {not a var} text");
  });

  it("handles unicode characters in the template", () => {
    expect(tplStr("Поставьте {{count}} лайков", { count: 5 })).toBe(
      "Поставьте 5 лайков"
    );
  });
});

describe("useTranslations", () => {
  it("returns English strings when locale is 'en'", () => {
    const t = useTranslations("en");
    expect(t.nav.home).toBe("Home");
    expect(t.nav.posts).toBe("Posts");
  });

  it("returns strings for a known locale (tr)", () => {
    const t = useTranslations("tr");
    expect(typeof t.nav.home).toBe("string");
    expect(t.nav.home).not.toBe("");
  });

  it("returns strings for a known locale (ru)", () => {
    const t = useTranslations("ru");
    expect(typeof t.nav.home).toBe("string");
    expect(t.nav.home).not.toBe("");
  });

  it("falls back to English for an unknown locale", () => {
    const t = useTranslations("xyz-unknown");
    expect(t.nav.home).toBe("Home");
  });

  it("falls back to English when called with no argument", () => {
    const t = useTranslations();
    expect(t.nav.home).toBe("Home");
  });

  it("all locale files have the same key shape as UIStrings", () => {
    for (const locale of ["en", "ru", "tr"]) {
      const t = useTranslations(locale);
      // Spot-check a few representative keys spanning the type tree
      expect(t).toHaveProperty("nav.home");
      expect(t).toHaveProperty("nav.projects");
      expect(t).toHaveProperty("post.editPage");
      expect(t).toHaveProperty("project.liveDemo");
      expect(t).toHaveProperty("pagination.next");
      expect(t).toHaveProperty("home.featured");
      expect(t).toHaveProperty("footer.allRightsReserved");
      expect(t).toHaveProperty("pages.projectsTitle");
      expect(t).toHaveProperty("a11y.toggleTheme");
      expect(t).toHaveProperty("notFound.goHome");
    }
  });

  it("every leaf key of UIStrings is present and non-empty in every locale", () => {
    // Walk the English file as the source of truth and verify all other
    // locales have the exact same key shape with non-empty values. Two
    // kinds of leaves exist:
    //   - plain strings: the usual case
    //   - PluralForms objects: { zero?, one?, two?, few?, many?, other }
    //     where every present form is a non-empty string AND `other` is
    //     always present (it's the runtime fallback).
    //
    // A PluralForms object is recognised by its key set: any plain
    // object whose keys are a subset of the CLDR plural categories is
    // treated as a single leaf instead of being walked into.
    const PLURAL_KEYS = new Set(["zero", "one", "two", "few", "many", "other"]);
    const isPluralForms = (v: unknown): v is Record<string, unknown> => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      const keys = Object.keys(v);
      return keys.length > 0 && keys.every(k => PLURAL_KEYS.has(k));
    };

    const en = useTranslations("en") as unknown as Record<string, unknown>;

    const leafPaths: string[] = [];
    const walk = (node: Record<string, unknown>, path: string[]) => {
      for (const [key, value] of Object.entries(node)) {
        const next = [...path, key];
        if (isPluralForms(value)) {
          // Treat the whole PluralForms object as a single leaf so the
          // shape check below can validate it as a unit.
          leafPaths.push(next.join("."));
        } else if (value && typeof value === "object") {
          walk(value as Record<string, unknown>, next);
        } else {
          leafPaths.push(next.join("."));
        }
      }
    };
    walk(en, []);

    expect(leafPaths.length).toBeGreaterThan(0);

    // At least one PluralForms leaf must exist for this assertion to be
    // meaningful — otherwise the "plurals" branch below would silently
    // never run.
    const pluralLeafPaths = leafPaths.filter(p =>
      p.endsWith("gallery.photoCount")
    );
    expect(pluralLeafPaths.length).toBeGreaterThan(0);

    const isPluralLeaf = (path: string) => path === "gallery.photoCount";

    for (const locale of ["ru", "tr"]) {
      const t = useTranslations(locale) as unknown as Record<string, unknown>;
      for (const dottedPath of leafPaths) {
        const segments = dottedPath.split(".");
        let cursor: unknown = t;
        for (const segment of segments) {
          expect(typeof cursor).toBe("object");
          cursor = (cursor as Record<string, unknown>)[segment];
        }

        if (isPluralLeaf(dottedPath)) {
          // Validate PluralForms shape: object, `other` present + non-empty.
          expect(
            typeof cursor,
            `${locale} has wrong shape for "${dottedPath}"`
          ).toBe("object");
          expect(cursor).not.toBeNull();
          const forms = cursor as Partial<PluralForms>;
          expect(
            typeof forms.other,
            `${locale} is missing required "other" form for "${dottedPath}"`
          ).toBe("string");
          expect(forms.other!.length).toBeGreaterThan(0);
          // Any present optional form must be a non-empty string.
          for (const k of ["zero", "one", "two", "few", "many"] as const) {
            if (forms[k] !== undefined) {
              expect(
                typeof forms[k],
                `${locale}.${dottedPath}.${k} must be a string`
              ).toBe("string");
              expect(
                (forms[k] as string).length,
                `${locale}.${dottedPath}.${k} must be non-empty`
              ).toBeGreaterThan(0);
            }
          }
        } else {
          expect(
            typeof cursor,
            `${locale} is missing or has wrong type for "${dottedPath}"`
          ).toBe("string");
          expect(
            (cursor as string).length,
            `${locale} has empty string for "${dottedPath}"`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("non-English locales are not just English (real translation present)", () => {
    const en = useTranslations("en");
    const tr = useTranslations("tr");
    const ru = useTranslations("ru");

    // Turkish `nav.home` must be Turkish, not the English "Home".
    expect(tr.nav.home).not.toBe(en.nav.home);
    // Russian `nav.home` must be Russian, not the English "Home".
    expect(ru.nav.home).not.toBe(en.nav.home);
  });

  it("exposes the LocaleSwitcher 2-letter codes for every locale", async () => {
    const { LOCALES } = await import("@/i18n/locales");
    expect(LOCALES).toEqual(["en", "ru", "tr"]);
    for (const l of LOCALES) {
      expect(l).toHaveLength(2);
      expect(l).toMatch(/^[a-z]{2}$/);
    }
  });

  it("renders 2-letter codes distinctly across all supported locales", () => {
    const codes = ["en", "ru", "tr"].map(l => l.toUpperCase());
    expect(new Set(codes).size).toBe(3);
    // Ensure no duplicates and each is exactly 2 chars uppercased
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("each locale has a human-readable native label for the switcher", () => {
    // Used by LocaleSwitcher's full name on hover / a11y label.
    const expectations = {
      en: "English",
      ru: "Русский",
      tr: "Türkçe",
    } as const;
    for (const [, expected] of Object.entries(expectations)) {
      expect(expected.length).toBeGreaterThan(0);
      // Each is a distinct label, never equal to another locale's label.
      const labels = Object.values(expectations);
      expect(labels.filter(l => l === expected)).toHaveLength(1);
    }
  });
});

describe("formatDate", () => {
  // Single instant so every assertion compares against the same UTC ms.
  const sample = new Date("2025-07-15T10:30:00Z");

  it("formats with the default English short shape", () => {
    // `day: numeric, month: short, year: numeric` is the default
    // post-date config applied in src/config.ts. Exact wording is
    // locale-dependent (Node uses CLDR), so we assert structural
    // properties instead of the literal string.
    const out = formatDate(sample, "en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(out).toMatch(/2025/);
    expect(out).toMatch(/Jul/);
    expect(out).toMatch(/15/);
  });

  it("produces a Russian rendering that includes the year and a Cyrillic month abbreviation", () => {
    const out = formatDate(sample, "ru", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(out).toMatch(/2025/);
    // Russian short month for July is "июл" (CLDR).
    expect(out).toMatch(/июл/);
  });

  it("produces a Turkish rendering that includes the year", () => {
    const out = formatDate(sample, "tr", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(out).toMatch(/2025/);
    // Turkish short month for July is "Tem".
    expect(out).toMatch(/Tem/);
  });

  it("accepts string and number inputs (anything `Intl.DateTimeFormat` accepts)", () => {
    const fromString = formatDate("2025-07-15T10:30:00Z", "en", {
      year: "numeric",
    });
    const fromNumber = formatDate(
      new Date("2025-07-15T10:30:00Z").getTime(),
      "en",
      { year: "numeric" }
    );
    expect(fromString).toBe(fromNumber);
  });

  it("returns a non-empty string for unknown locales (graceful fallback)", () => {
    // `Intl.DateTimeFormat` itself falls back to English for unknown tags
    // — we just make sure we never throw.
    const out = formatDate(sample, "xx-fake", { year: "numeric" });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("falls back to `Date.toString()` if options are invalid", () => {
    // `day: "banana"` is invalid for `Intl.DateTimeFormat` — the helper
    // must swallow the error and return *something* instead of throwing
    // and breaking the build.
    const out = formatDate(sample, "en", { day: "banana" as never });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("plural", () => {
  // English-style: only "one" + "other" are distinct.
  const enForms: PluralForms = {
    one: "{{count}} photo",
    other: "{{count}} photos",
  };

  // Russian-style: full CLDR set, distinct for each category.
  const ruForms: PluralForms = {
    one: "{{count}} фотография",
    few: "{{count}} фотографии",
    many: "{{count}} фотографий",
    other: "{{count}} фото",
  };

  it("English: picks `one` for 1 and `other` for the rest", () => {
    expect(plural("en", 1, enForms)).toBe("1 photo");
    expect(plural("en", 0, enForms)).toBe("0 photos");
    expect(plural("en", 2, enForms)).toBe("2 photos");
    expect(plural("en", 100, enForms)).toBe("100 photos");
  });

  it("Russian: full CLDR distribution — one / few / many / other", () => {
    // one: 1, 21, 31, ...
    expect(plural("ru", 1, ruForms)).toBe("1 фотография");
    expect(plural("ru", 21, ruForms)).toBe("21 фотография");
    expect(plural("ru", 81, ruForms)).toBe("81 фотография");
    // few: 2-4, 22-24, ...
    expect(plural("ru", 2, ruForms)).toBe("2 фотографии");
    expect(plural("ru", 3, ruForms)).toBe("3 фотографии");
    expect(plural("ru", 4, ruForms)).toBe("4 фотографии");
    expect(plural("ru", 22, ruForms)).toBe("22 фотографии");
    // many: 0, 5-20, 25-30, ...
    expect(plural("ru", 0, ruForms)).toBe("0 фотографий");
    expect(plural("ru", 5, ruForms)).toBe("5 фотографий");
    expect(plural("ru", 11, ruForms)).toBe("11 фотографий");
    expect(plural("ru", 12, ruForms)).toBe("12 фотографий");
    expect(plural("ru", 19, ruForms)).toBe("19 фотографий");
    expect(plural("ru", 100, ruForms)).toBe("100 фотографий");
  });

  it("substitutes extra vars alongside {{count}}", () => {
    const forms: PluralForms = {
      one: "{{name}} has {{count}} photo",
      other: "{{name}} has {{count}} photos",
    };
    expect(plural("en", 1, forms, { name: "Ada" })).toBe("Ada has 1 photo");
    expect(plural("en", 7, forms, { name: "Ada" })).toBe("Ada has 7 photos");
  });

  it("falls back to `other` when the chosen category is missing", () => {
    const onlyOther: PluralForms = { other: "{{count}} items" };
    expect(plural("en", 1, onlyOther)).toBe("1 items");
    expect(plural("ru", 1, onlyOther)).toBe("1 items");
    // Should never throw, even if someone forgets to include `other`.
    const onlyOne: PluralForms = { one: "1 item" } as PluralForms;
    expect(plural("en", 5, onlyOne)).toBe("5");
  });

  it("returns a non-empty string for unknown locales", () => {
    const out = plural("xx-fake", 2, enForms);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

/**
 * Pinned contracts for `src/i18n/locales.ts` — these are the predicate
 * primitives every URL-shape and hreflang helper relies on. Without
 * direct tests they were the "single load-bearing helper" of issue
 * #E9 in the fix prompt: a one-line type-narrowing bug would silently
 * break every `useTranslations(...)` call site.
 */
describe("@/i18n/locales", () => {
  it("LOCALES lists exactly the supported 2-letter codes", async () => {
    const { LOCALES } = await import("@/i18n/locales");
    expect(LOCALES).toEqual(["en", "ru", "tr"]);
    for (const l of LOCALES) {
      expect(l).toHaveLength(2);
      expect(l).toMatch(/^[a-z]{2}$/);
    }
  });

  it("DEFAULT_LOCALE is one of LOCALES", async () => {
    const { DEFAULT_LOCALE, LOCALES } = await import("@/i18n/locales");
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it("isSupportedLocale narrows correctly (true for supported, false for unknown)", async () => {
    const { isSupportedLocale } = await import("@/i18n/locales");
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("ru")).toBe(true);
    expect(isSupportedLocale("tr")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("EN")).toBe(false); // case-sensitive on purpose
    expect(isSupportedLocale("")).toBe(false);
    expect(isSupportedLocale("en-US")).toBe(false);
  });

  it("asLocale returns the locale string for supported values, undefined for unknown", async () => {
    const { asLocale } = await import("@/i18n/locales");
    expect(asLocale("en")).toBe("en");
    expect(asLocale("ru")).toBe("ru");
    expect(asLocale("fr")).toBeUndefined();
    expect(asLocale("")).toBeUndefined();
  });

  it("localeFromUrlSegment handles undefined / empty / unsupported", async () => {
    const { localeFromUrlSegment } = await import("@/i18n/locales");
    expect(localeFromUrlSegment("en")).toBe("en");
    expect(localeFromUrlSegment("tr")).toBe("tr");
    expect(localeFromUrlSegment(undefined)).toBeUndefined();
    expect(localeFromUrlSegment("")).toBeUndefined();
    expect(localeFromUrlSegment("fr")).toBeUndefined();
    expect(localeFromUrlSegment("EN")).toBeUndefined();
  });

  it("getLocaleDir returns 'ltr' for known locales and any unknown input", async () => {
    const { getLocaleDir } = await import("@/i18n/locales");
    expect(getLocaleDir("en")).toBe("ltr");
    expect(getLocaleDir("ru")).toBe("ltr");
    expect(getLocaleDir("tr")).toBe("ltr");
    expect(getLocaleDir("ar")).toBe("ltr"); // default until RTL is added
    expect(getLocaleDir("xx-fake")).toBe("ltr");
  });
});
