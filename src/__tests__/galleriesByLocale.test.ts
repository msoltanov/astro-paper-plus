import { describe, it, expect } from "vitest";
import { galleriesByLocale } from "@/utils/galleriesByLocale";
import type { CollectionEntry } from "astro:content";

const makeGallery = (
  id: string,
  filePath?: string
): CollectionEntry<"galleries"> =>
  ({
    id,
    filePath,
    data: {} as CollectionEntry<"galleries">["data"],
  }) as unknown as CollectionEntry<"galleries">;

describe("galleriesByLocale", () => {
  it("matches galleries whose detected locale equals the requested one", () => {
    const filter = galleriesByLocale("tr");
    expect(
      filter(makeGallery("walk.mdx", "src/content/galleries/ru/walk.mdx"))
    ).toBe(false);
    expect(
      filter(makeGallery("en/walk.mdx", "src/content/galleries/en/walk.mdx"))
    ).toBe(false);
    expect(
      filter(makeGallery("tr/walk.mdx", "src/content/galleries/tr/walk.mdx"))
    ).toBe(true);
  });

  it("matches the supported locales", () => {
    for (const locale of ["en", "ru", "tr"]) {
      const filter = galleriesByLocale(locale);
      expect(
        filter(
          makeGallery(
            `${locale}/gallery.mdx`,
            `src/content/galleries/${locale}/gallery.mdx`
          )
        )
      ).toBe(true);
    }
  });

  it("falls back to the default locale for galleries without a locale prefix", () => {
    const filter = galleriesByLocale("en");
    expect(filter(makeGallery("legacy.mdx"))).toBe(true);
    expect(
      filter(makeGallery("legacy.mdx", "src/content/galleries/legacy.mdx"))
    ).toBe(true);
  });

  it("ignores non-locale prefixes inside filePath", () => {
    const filter = galleriesByLocale("en");
    expect(filter(makeGallery("any.mdx", "/tmp/random/any.mdx"))).toBe(true);
  });

  it("strips the galleries collection dir instead of treating it as locale", () => {
    // Regression: `galleries` itself used to trip up locale detection when
    // COLLECTION_DIRS only recognised `posts` and `projects`.
    const filter = galleriesByLocale("ru");
    expect(
      filter(makeGallery("walk.mdx", "src/content/galleries/ru/walk.mdx"))
    ).toBe(true);
    expect(
      filter(makeGallery("walk.mdx", "src/content/galleries/tr/walk.mdx"))
    ).toBe(false);
  });
});
