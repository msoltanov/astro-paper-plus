import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { z } from "zod";

const contentConfigSource = readFileSync("src/content.config.ts", "utf8");
const SLUG_PATTERN_SOURCE = String.raw`^[A-Za-z0-9_\-/]+$`;
const DATE_PATTERN_SOURCE = String.raw`[Zz]$|[+-]\d{2}:?\d{2}$`;

/**
 * Smoke tests for the Zod rules layered into `src/content.config.ts`.
 *
 * `setup.ts` mocks `astro/zod` with a no-op chain so utility tests can
 * import schemas without booting Astro. That mocking makes schema
 * *validation* hollow — these tests cover the validation behaviour
 * directly using the real `zod` package, mirroring the contracts the
 * content-config schemas express.
 *
 * For an end-to-end runtime validation test we'd need to import the
 * real `content.config.ts` outside the mocked environment — keep this
 * file as the lightweight rule contract, and rely on `astro check` /
 * the build pipeline to catch end-to-end regressions.
 */
describe("content collection schema rules", () => {
  describe("slug override (shared across posts/projects/galleries)", () => {
    const slugSchema = z
      .string()
      .regex(new RegExp(SLUG_PATTERN_SOURCE), "must match the slug charset")
      .optional();

    it("uses the same slug regex as content.config.ts", () => {
      expect(contentConfigSource).toContain(`/${SLUG_PATTERN_SOURCE}/`);
    });

    it("accepts a simple slug", () => {
      expect(slugSchema.safeParse("my-post-slug").success).toBe(true);
      expect(slugSchema.safeParse("nested/path/slug").success).toBe(true);
      expect(slugSchema.safeParse("a_b-c/123").success).toBe(true);
    });

    it("rejects slugs with spaces or punctuation outside the charset", () => {
      expect(slugSchema.safeParse("my post").success).toBe(false);
      expect(slugSchema.safeParse("post!").success).toBe(false);
      expect(slugSchema.safeParse("../etc").success).toBe(false);
      // `/leading` is technically allowed by the charset regex
      // (`/` is in the allowed set) but `normalizeSlugOverride` strips
      // it. The regex itself only enforces the character class — the
      // "no leading slash" rule is enforced at a higher layer.
      expect(slugSchema.safeParse("/leading").success).toBe(true);
    });
  });

  describe("pubDatetime — string-with-explicit-TZ only", () => {
    // M — the schema accepts ONLY a string carrying an explicit TZ
    // marker (Z, +HH:MM, or -HH:MM with optional colon). `z.date()`
    // is intentionally NOT in the union: YAML 1.2 interprets a bare
    // `pubDatetime: 2025-09-12T10:30:00Z` (no quotes) as a native
    // Date via `new Date(str)`, and naive inputs would silently
    // drift across build environments (macOS dev vs. UTC CI vs.
    // production Linux). Forcing `z.string()` makes authors quote
    // the value, the regex checks the TZ marker, and
    // `parseDateInTz` does the final resolution against the post's
    // declared timezone. Mirrors `src/content.config.ts:sharedFrontmatter`.
    const dateField = z
      .string()
      .regex(
        new RegExp(DATE_PATTERN_SOURCE),
        "must carry explicit timezone marker"
      );

    it("uses the same timezone-marker regex as content.config.ts", () => {
      expect(contentConfigSource).toContain(`/${DATE_PATTERN_SOURCE}/`);
    });

    it("accepts ISO strings with a trailing Z marker", () => {
      expect(dateField.safeParse("2024-01-01T00:00:00Z").success).toBe(true);
    });

    it("accepts ISO strings with an explicit numeric offset", () => {
      expect(dateField.safeParse("2024-01-01T00:00:00+07:00").success).toBe(
        true
      );
      expect(dateField.safeParse("2024-01-01T00:00:00-0500").success).toBe(
        true
      );
    });

    it("rejects ISO strings WITHOUT an explicit timezone marker (cross-env drift guard)", () => {
      // Naive datetime — `new Date(str)` resolves in the build
      // machine's local TZ, producing a different absolute UTC
      // instant on macOS dev vs. UTC CI vs. production Linux. The
      // regex fails loud at the schema layer so the build surfaces
      // a clear "must carry a TZ marker" error.
      expect(dateField.safeParse("2024-01-01T00:00:00").success).toBe(false);
      expect(dateField.safeParse("2024-01-01").success).toBe(false);
    });

    it("rejects Date instances (the YAML 1.2 native-timestamp interpretation vector)", () => {
      // `z.string()` does not accept Date. Authors who want a Date
      // type must explicitly quote the value in frontmatter so YAML
      // hands the schema a string. This is the loud-fail point of
      // the M14 fix — every unquoted frontmatter date that the
      // build machine's TZ could re-interpret fails here.
      expect(
        dateField.safeParse(new Date("2024-01-01T00:00:00Z")).success
      ).toBe(false);
    });

    it("rejects non-string inputs", () => {
      expect(dateField.safeParse(12345).success).toBe(false);
      expect(dateField.safeParse({}).success).toBe(false);
      expect(dateField.safeParse(null).success).toBe(false);
    });
  });

  describe("modDatetime — same string-with-TZ contract, optional + nullable", () => {
    // Mirrors `modDatetime: dateField.optional().nullable()` in
    // `sharedFrontmatter`. Absent values pass; populated values
    // honour the same string-with-TZ contract as pubDatetime.
    const dateField = z
      .string()
      .regex(
        new RegExp(DATE_PATTERN_SOURCE),
        "must carry explicit timezone marker"
      );
    const field = dateField.optional().nullable();

    it("accepts undefined and null (absent or explicitly cleared)", () => {
      expect(field.safeParse(undefined).success).toBe(true);
      expect(field.safeParse(null).success).toBe(true);
    });

    it("accepts ISO strings with explicit TZ markers", () => {
      expect(field.safeParse("2024-01-01T00:00:00Z").success).toBe(true);
      expect(field.safeParse("2024-01-01T00:00:00+07:00").success).toBe(true);
    });

    it("rejects naive ISO strings", () => {
      expect(field.safeParse("2024-01-01T00:00:00").success).toBe(false);
    });

    it("rejects Date instances", () => {
      expect(field.safeParse(new Date("2024-01-01T00:00:00Z")).success).toBe(
        false
      );
    });
  });

  describe("tags default fallback", () => {
    const tagsField = z.array(z.string()).default(["others"]);

    it("defaults to ['others'] when the array is missing", () => {
      expect(tagsField.parse(undefined)).toEqual(["others"]);
    });

    it("preserves explicitly empty arrays", () => {
      // `z.array(...).default(...)` only substitutes the default when
      // the value is `undefined`, not for `[]` — empty tag list is a
      // valid author choice and shouldn't be silently rewritten.
      expect(tagsField.parse([])).toEqual([]);
    });

    it("accepts a populated array", () => {
      expect(tagsField.parse(["a", "b"])).toEqual(["a", "b"]);
    });
  });

  describe("ogImage — image() or string fallback", () => {
    // Mirrors `image().or(z.string()).optional()`. Without an Astro
    // image() function we test the string path.
    const field = z.string().optional();

    it("accepts a string URL", () => {
      expect(field.safeParse("/img.png").success).toBe(true);
    });

    it("accepts undefined (post has no OG override)", () => {
      expect(field.safeParse(undefined).success).toBe(true);
    });
  });

  describe("galleries.images — minimum-length array of typed entries", () => {
    const imageEntry = z.object({
      src: z.string(),
      alt: z.string().min(1),
      caption: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    });
    const imagesSchema = z.array(imageEntry).min(1);

    it("rejects an empty image list", () => {
      expect(imagesSchema.safeParse([]).success).toBe(false);
    });

    it("rejects an entry missing the required alt text", () => {
      expect(imagesSchema.safeParse([{ src: "/a.jpg", alt: "" }]).success).toBe(
        false
      );
    });

    it("accepts a single well-formed entry", () => {
      expect(
        imagesSchema.safeParse([
          {
            src: "/a.jpg",
            alt: "alt",
            caption: "cap",
            width: 800,
            height: 600,
          },
        ]).success
      ).toBe(true);
    });
  });
});
