import { describe, expect, it } from "vitest";
import { buildTagLocaleMap } from "@/utils/tagSiblings";

const entry = (
  id: string,
  filePath: string,
  tags: string[]
): { id: string; filePath: string; data: { tags: string[] } } => ({
  id,
  filePath,
  data: { tags },
});

describe("buildTagLocaleMap", () => {
  it("groups tag slugs by the locales that render them", () => {
    const map = buildTagLocaleMap([
      entry("en/astro.md", "src/content/posts/en/astro.md", ["Astro"]),
      entry("ru/astro.md", "src/content/posts/ru/astro.md", ["Astro"]),
      entry("tr/web.md", "src/content/posts/tr/web.md", ["Web"]),
    ]);

    expect(map.get("astro")).toEqual(["en", "ru"]);
    expect(map.get("web")).toEqual(["tr"]);
  });

  it("ignores unsupported locales", () => {
    const map = buildTagLocaleMap([
      entry("en/astro.md", "src/content/posts/en/astro.md", ["Astro"]),
      entry("fr/astro.md", "src/content/posts/fr/astro.md", ["Astro"]),
    ]);
    expect(map.get("astro")).toEqual(["en"]);
  });
});
