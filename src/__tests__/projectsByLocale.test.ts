import { describe, it, expect } from "vitest";
import { projectsByLocale } from "@/utils/projectsByLocale";
import type { CollectionEntry } from "astro:content";

const makeProject = (
  id: string,
  filePath?: string
): CollectionEntry<"projects"> =>
  ({
    id,
    filePath,
    data: {} as CollectionEntry<"projects">["data"],
  }) as unknown as CollectionEntry<"projects">;

describe("projectsByLocale", () => {
  it("matches projects whose detected locale equals the requested one", () => {
    const filter = projectsByLocale("tr");
    expect(
      filter(makeProject("site.mdx", "src/content/projects/tr/site.mdx"))
    ).toBe(true);
    expect(
      filter(makeProject("en/site.mdx", "src/content/projects/en/site.mdx"))
    ).toBe(false);
  });

  it("matches the supported locales", () => {
    for (const locale of ["en", "ru", "tr"]) {
      const filter = projectsByLocale(locale);
      expect(
        filter(
          makeProject(
            `${locale}/project.mdx`,
            `src/content/projects/${locale}/project.mdx`
          )
        )
      ).toBe(true);
    }
  });

  it("falls back to the default locale for projects without a locale prefix", () => {
    const filter = projectsByLocale("en");
    expect(filter(makeProject("legacy.mdx"))).toBe(true);
    expect(
      filter(makeProject("legacy.mdx", "src/content/projects/legacy.mdx"))
    ).toBe(true);
  });

  it("ignores non-locale prefixes inside filePath", () => {
    const filter = projectsByLocale("en");
    expect(filter(makeProject("any.mdx", "/tmp/random/any.mdx"))).toBe(true);
  });
});
