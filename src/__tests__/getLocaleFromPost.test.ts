import { describe, it, expect } from "vitest";
import { getLocaleFromPost } from "@/utils/getLocaleFromPost";
import type { CollectionEntry } from "astro:content";

const makePost = (
  id: string,
  filePath?: string
): Pick<CollectionEntry<"posts">, "id" | "filePath"> =>
  ({ id, filePath }) as unknown as Pick<
    CollectionEntry<"posts">,
    "id" | "filePath"
  >;

describe("getLocaleFromPost", () => {
  it("detects locale from filePath when present", () => {
    expect(
      getLocaleFromPost(makePost("hello.mdx", "src/content/posts/tr/hello.mdx"))
    ).toBe("tr");
    expect(
      getLocaleFromPost(
        makePost("hello.mdx", "src/content/posts/tr/examples/hello.mdx")
      )
    ).toBe("tr");
    expect(
      getLocaleFromPost(
        makePost("hello.mdx", "src/content/posts/ru/_releases/hello.mdx")
      )
    ).toBe("ru");
    expect(
      getLocaleFromPost(makePost("hello.mdx", "src/content/posts/en/x.mdx"))
    ).toBe("en");
  });

  it("detects locale from id when filePath missing", () => {
    expect(getLocaleFromPost(makePost("tr/hello.mdx"))).toBe("tr");
    expect(getLocaleFromPost(makePost("tr/foo/bar.mdx"))).toBe("tr");
  });

  it("falls back to en when no locale prefix is detected", () => {
    expect(getLocaleFromPost(makePost("hello.mdx"))).toBe("en");
    expect(
      getLocaleFromPost(makePost("hello.mdx", "src/content/posts/hello.mdx"))
    ).toBe("en");
    expect(getLocaleFromPost(makePost("es/foo.mdx"))).toBe("en");
    expect(
      getLocaleFromPost(makePost("hello.mdx", "src/content/posts/es/hello.mdx"))
    ).toBe("en");
  });

  it("ignores non-locale prefixes inside filePath", () => {
    // filePath without "posts" or with non-locale prefix → default
    expect(
      getLocaleFromPost(makePost("hello.mdx", "/tmp/random/hello.mdx"))
    ).toBe("en");
  });
});
