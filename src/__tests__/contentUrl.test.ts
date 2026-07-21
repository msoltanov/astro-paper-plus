import { describe, it, expect } from "vitest";
import { getContentUrl } from "@/utils/contentUrl";

/**
 * `getContentUrl` is the URL-shaping contract every collection lookup
 * goes through. Behaviour depends on the mocked `getRelativeLocaleUrl`
 * in `src/__tests__/setup.ts` (which mirrors Astro's runtime shape for
 * `trailingSlash: "ignore"`):
 *   - `en` + `posts/hello`   → `/posts/hello/`
 *   - `tr` + `posts/hello`   → `/tr/posts/hello/`
 *   - `en` + `posts`         → `/posts/`
 *   - `tr` + ``              → `/tr/`
 */
describe("getContentUrl", () => {
  it("builds a locale-relative URL with a trailing slash for nested paths", () => {
    expect(getContentUrl("posts", "en/hello.mdx", undefined, "en")).toBe(
      "/posts/hello/"
    );
    expect(
      getContentUrl("posts", "en/examples/hello.mdx", undefined, "en")
    ).toBe("/posts/examples/hello/");
  });

  it("prefixes non-default locales with the locale code", () => {
    expect(getContentUrl("posts", "tr/hello.mdx", undefined, "tr")).toBe(
      "/tr/posts/hello/"
    );
    expect(
      getContentUrl(
        "projects",
        "ru/x.mdx",
        "src/content/projects/ru/x.mdx",
        "ru"
      )
    ).toBe("/ru/projects/x/");
  });

  it("emits the canonical trailing slash on default-locale directory URLs", () => {
    // The empty path within a collection directory produces the root listing.
    expect(getContentUrl("posts", "en", undefined, "en")).toBe("/posts/");
  });

  it("honors a slug override (still under the collection dir)", () => {
    expect(
      getContentUrl(
        "posts",
        "en/adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        "en",
        "guides/e2e-testing"
      )
    ).toBe("/posts/guides/e2e-testing/");
  });

  it("falls back to id-only segments when filePath is missing (still under the collection dir)", () => {
    expect(getContentUrl("posts", "tr/site-rewrite.mdx", undefined, "tr")).toBe(
      "/tr/posts/site-rewrite/"
    );
  });

  it("passes through for all three collection dirs", () => {
    expect(getContentUrl("projects", "en/x.mdx", undefined, "en")).toBe(
      "/projects/x/"
    );
    expect(
      getContentUrl(
        "galleries",
        "tr/y.mdx",
        "src/content/galleries/tr/y.mdx",
        "tr"
      )
    ).toBe("/tr/galleries/y/");
  });
});
