/**
 * Tests for the new helpers in `src/utils/hrefByLocaleForStaticRoute.ts`:
 *   - `staticHreflangMap(logicalName, siteOrigin)` — full hreflang map
 *     for a non-post static page (all supported locales + x-default).
 *   - `getStaticHreflangForPathname(pathname, siteOrigin)` — pathname
 *     resolver used by the sitemap integration to find the right
 *     hreflang cluster for a built page.
 *
 * The full hreflang cluster is a key SEO contract (see issues.md H7):
 * every non-search, non-404, non-post page must declare the complete
 * set of alternates — including the SELF locale — so search engines
 * can resolve the cluster reliably.
 */
import { describe, it, expect } from "vitest";
import {
  staticHreflangMap,
  getStaticHreflangForPathname,
} from "@/utils/hrefByLocaleForStaticRoute";

const SITE_ORIGIN = "https://astro-paper-plus.pages.dev";

describe("staticHreflangMap", () => {
  it("builds the home map: EN root, others at /<locale>/, x-default → EN", () => {
    const map = staticHreflangMap("", SITE_ORIGIN);
    expect(map).toBeDefined();
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/`);
    expect(map!["ru"]).toBe(`${SITE_ORIGIN}/ru/`);
    expect(map!["tr"]).toBe(`${SITE_ORIGIN}/tr/`);
    expect(map!["x-default"]).toBe(`${SITE_ORIGIN}/`);
  });

  it("builds the about map with x-default pointing at the EN URL", () => {
    const map = staticHreflangMap("about", SITE_ORIGIN);
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/about/`);
    expect(map!["ru"]).toBe(`${SITE_ORIGIN}/ru/about/`);
    expect(map!["tr"]).toBe(`${SITE_ORIGIN}/tr/about/`);
    expect(map!["x-default"]).toBe(`${SITE_ORIGIN}/about/`);
  });

  it("builds the posts index map", () => {
    const map = staticHreflangMap("posts", SITE_ORIGIN);
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/posts/`);
    expect(map!["ru"]).toBe(`${SITE_ORIGIN}/ru/posts/`);
    expect(map!["x-default"]).toBe(`${SITE_ORIGIN}/posts/`);
  });

  it("builds the projects map", () => {
    const map = staticHreflangMap("projects", SITE_ORIGIN);
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/projects/`);
    expect(map!["tr"]).toBe(`${SITE_ORIGIN}/tr/projects/`);
  });

  it("builds the galleries map", () => {
    const map = staticHreflangMap("galleries", SITE_ORIGIN);
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/galleries/`);
    expect(map!["tr"]).toBe(`${SITE_ORIGIN}/tr/galleries/`);
  });

  it("always includes the self locale in the map (no self-filter)", () => {
    // H7 fix: the previous build filtered the active locale out of
    // the hreflang set, so search engines saw only the OTHER
    // alternates. Every locale the page exists in must be present
    // in the cluster, including the self locale.
    const map = staticHreflangMap("about", SITE_ORIGIN);
    expect(Object.keys(map!).sort()).toEqual(
      ["en", "ru", "tr", "x-default"].sort()
    );
  });

  it("returns undefined for unknown logical names", () => {
    expect(staticHreflangMap("aboutt", SITE_ORIGIN)).toBeUndefined();
    expect(staticHreflangMap("search", SITE_ORIGIN)).toBeUndefined();
  });
});

describe("getStaticHreflangForPathname", () => {
  it("returns the home map for an empty pathname", () => {
    const map = getStaticHreflangForPathname("", SITE_ORIGIN);
    expect(map).toBeDefined();
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/`);
    expect(map!["x-default"]).toBe(`${SITE_ORIGIN}/`);
  });

  it("returns the home map for the root pathname", () => {
    const map = getStaticHreflangForPathname("/", SITE_ORIGIN);
    expect(map).toBeDefined();
    expect(map!["en"]).toBe(`${SITE_ORIGIN}/`);
  });

  it("returns the home map for a locale-prefixed home (e.g. /ru/)", () => {
    // H7 regression: previous build skipped /ru/ and /tr/ in the
    // sitemap because a single-segment pathname was treated as a
    // default-locale page, not a locale-prefixed home.
    const ru = getStaticHreflangForPathname("/ru/", SITE_ORIGIN);
    const tr = getStaticHreflangForPathname("/tr/", SITE_ORIGIN);
    expect(ru).toBeDefined();
    expect(tr).toBeDefined();
    expect(ru!["x-default"]).toBe(`${SITE_ORIGIN}/`);
  });

  it("returns the about map for /about/ and /ru/about/", () => {
    const en = getStaticHreflangForPathname("/about/", SITE_ORIGIN);
    const ru = getStaticHreflangForPathname("/ru/about/", SITE_ORIGIN);
    expect(en).toBeDefined();
    expect(ru).toBeDefined();
    // Both should resolve to the same cluster (logical name "about").
    expect(en!["en"]).toBe(ru!["en"]);
    expect(en!["ru"]).toBe(ru!["ru"]);
  });

  it("returns the posts index map for /posts/ and /ru/posts/", () => {
    const en = getStaticHreflangForPathname("/posts/", SITE_ORIGIN);
    const ru = getStaticHreflangForPathname("/ru/posts/", SITE_ORIGIN);
    expect(en!["en"]).toBe(`${SITE_ORIGIN}/posts/`);
    expect(ru!["ru"]).toBe(`${SITE_ORIGIN}/ru/posts/`);
  });

  it("returns undefined for post detail pages (not a static route)", () => {
    // Post detail pages use the post-hreflang path, not the static
    // path. The sitemap pages chunk skips them via `parsePostUrl`
    // before this resolver is consulted, but the helper itself
    // should still return undefined for those pathnames.
    expect(
      getStaticHreflangForPathname(
        "/posts/adding-new-posts-in-astropaper-theme/",
        SITE_ORIGIN
      )
    ).toBeUndefined();
  });

  it("returns undefined for pagination URLs", () => {
    // /posts/2/ has 2 segments and the second ("2") isn't a
    // supported logical name, so the resolver returns undefined and
    // the page goes out with no hreflang (correct — pagination is
    // canonical to /posts/, not an alternate).
    expect(
      getStaticHreflangForPathname("/posts/2/", SITE_ORIGIN)
    ).toBeUndefined();
    expect(
      getStaticHreflangForPathname("/ru/posts/3/", SITE_ORIGIN)
    ).toBeUndefined();
  });

  it("returns undefined for project/gallery detail pages", () => {
    expect(
      getStaticHreflangForPathname("/projects/astropaper/", SITE_ORIGIN)
    ).toBeUndefined();
    expect(
      getStaticHreflangForPathname("/ru/projects/astropaper/", SITE_ORIGIN)
    ).toBeUndefined();
  });

  it("returns undefined for unknown logical names", () => {
    expect(
      getStaticHreflangForPathname("/aboutt/", SITE_ORIGIN)
    ).toBeUndefined();
  });

  it("returns undefined for 2-segment paths with an unknown locale prefix", () => {
    // /xx/about/ — first segment isn't a supported locale.
    expect(
      getStaticHreflangForPathname("/xx/about/", SITE_ORIGIN)
    ).toBeUndefined();
  });
});
