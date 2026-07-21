/**
 * Tests for `src/utils/hrefByLocaleForStaticRoute.ts`.
 *
 * The helper builds a `hrefByLocale` map for non-post static pages
 * (home, about, posts index, projects index, galleries index). It is
 * consumed by `Layout.astro` to emit per-locale `<link rel="alternate"
 * hreflang="...">` head annotations — see issues.md verdict H7.
 */
import { describe, it, expect } from "vitest";
import {
  hrefByLocaleForStaticRoute,
  hrefByLocaleForTag,
} from "@/utils/hrefByLocaleForStaticRoute";

const SITE_ORIGIN = "https://astro-paper-plus.pages.dev";

describe("hrefByLocaleForStaticRoute", () => {
  it("builds the home map: EN root, others at /<locale>/", () => {
    const map = hrefByLocaleForStaticRoute("", SITE_ORIGIN, "en");
    expect(map.en).toBe(`${SITE_ORIGIN}/`);
    expect(map.ru).toBe(`${SITE_ORIGIN}/ru/`);
    expect(map.tr).toBe(`${SITE_ORIGIN}/tr/`);
  });

  it("builds the about map with the right per-locale paths", () => {
    const map = hrefByLocaleForStaticRoute("about", SITE_ORIGIN, "ru");
    expect(map.en).toBe(`${SITE_ORIGIN}/about/`);
    expect(map.ru).toBe(`${SITE_ORIGIN}/ru/about/`);
    expect(map.tr).toBe(`${SITE_ORIGIN}/tr/about/`);
  });

  it("builds the posts index map (no per-page variant — pagination self-canonicalises)", () => {
    const map = hrefByLocaleForStaticRoute("posts", SITE_ORIGIN, "en");
    expect(map.en).toBe(`${SITE_ORIGIN}/posts/`);
    expect(map.ru).toBe(`${SITE_ORIGIN}/ru/posts/`);
  });

  it("builds the projects and galleries maps", () => {
    const projects = hrefByLocaleForStaticRoute("projects", SITE_ORIGIN, "tr");
    expect(projects.tr).toBe(`${SITE_ORIGIN}/tr/projects/`);

    const galleries = hrefByLocaleForStaticRoute(
      "galleries",
      SITE_ORIGIN,
      "tr"
    );
    expect(galleries.en).toBe(`${SITE_ORIGIN}/galleries/`);
    expect(galleries.tr).toBe(`${SITE_ORIGIN}/tr/galleries/`);
  });

  it("always returns an entry for every locale in LOCALES", () => {
    // Important: Layout.astro emits nothing for missing locales, so a
    // partial map silently drops the corresponding hreflang. Every
    // non-search, non-404, non-post page exists in every locale, so
    // the map must always have a full set of entries.
    const map = hrefByLocaleForStaticRoute("about", SITE_ORIGIN, "en");
    expect(Object.keys(map).sort()).toEqual(["en", "ru", "tr"]);
  });

  it("throws on unknown logical names so a typo surfaces at build time", () => {
    expect(() =>
      hrefByLocaleForStaticRoute("aboutt", SITE_ORIGIN, "en")
    ).toThrow(/unknown logicalName/);
    expect(() =>
      hrefByLocaleForStaticRoute("search", SITE_ORIGIN, "en")
    ).toThrow(/unknown logicalName/);
  });

  it("throws if currentLocale is not in LOCALES (programmer error)", () => {
    expect(() =>
      hrefByLocaleForStaticRoute("about", SITE_ORIGIN, "xx")
    ).toThrow(/not in LOCALES/);
  });

  // #13 SEO — the 404 routes need a hreflang cluster so search
  // engines can disambiguate the wrong-locale 404 in their index.
  // The URL is `/<locale>/404/` (with trailing slash) to match
  // the `<link rel="canonical">` URL Astro emits for those routes;
  // a mismatch between canonical and hreflang makes the cluster
  // invalid per Google's hreflang spec.
  describe("404 logical name", () => {
    it("builds the 404 hreflang cluster with trailing-slash URLs", () => {
      const map = hrefByLocaleForStaticRoute("404", SITE_ORIGIN, "en");
      expect(map.en).toBe(`${SITE_ORIGIN}/404/`);
      expect(map.ru).toBe(`${SITE_ORIGIN}/ru/404/`);
      expect(map.tr).toBe(`${SITE_ORIGIN}/tr/404/`);
    });

    it("accepts any supported locale as the current-locale argument", () => {
      // The other 404 route files (ru/tr) reuse the same helper;
      // a sanity check that the helper accepts every locale.
      const ru = hrefByLocaleForStaticRoute("404", SITE_ORIGIN, "ru");
      expect(ru.en).toBe(`${SITE_ORIGIN}/404/`);
      const tr = hrefByLocaleForStaticRoute("404", SITE_ORIGIN, "tr");
      expect(tr.tr).toBe(`${SITE_ORIGIN}/tr/404/`);
    });
  });

  describe("hrefByLocaleForTag", () => {
    it("encodes the slug and emits only the available locales plus current", () => {
      const map = hrefByLocaleForTag("Астро", SITE_ORIGIN, "ru", ["ru"]);
      expect(map.ru).toBe(
        `${SITE_ORIGIN}/ru/tags/${encodeURIComponent("Астро")}/`
      );
      expect(map.en).toBeUndefined();
    });

    it("fills in the current locale when it is not in the available set", () => {
      const map = hrefByLocaleForTag("tag", SITE_ORIGIN, "en", ["ru"]);
      expect(map.en).toBe(`${SITE_ORIGIN}/tags/tag/`);
    });
  });
});
