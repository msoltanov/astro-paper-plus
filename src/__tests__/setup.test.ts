import { describe, it, expect } from "vitest";
import { getRelativeLocaleUrlMock } from "./astroI18nMock";

/**
 * Regression test pinning the canonical `astro:i18n` mock shape
 * installed in `src/__tests__/setup.ts`. The mock mirrors Astro's
 * runtime `getRelativeLocaleUrl` for `trailingSlash: 'ignore'`, which
 * is what the production build emits (`dist/posts/<slug>/index.html`
 * ↔ `dist/sitemap-posts-0.xml` — see issues.md H2 / H8).
 *
 * Three test files (getPostPaths, getGalleryPaths, getProjectPaths)
 * used to reimplement this mock with a *different* shape (no trailing
 * slash) which disagreed with the production output. The mock is now
 * the single source of truth for both consumers and tests. Any change
 * to this contract is a deliberate behavioural change and must be
 * matched by an update to `dist/` and the head ↔ sitemap hreflang
 * shape.
 */
describe("canonical astro:i18n mock (setup.ts)", () => {
  it("emits /posts/<slug>/ for the default locale", () => {
    expect(getRelativeLocaleUrlMock("en", "posts/hello")).toBe("/posts/hello/");
  });

  it("emits /<locale>/posts/<slug>/ for non-default locales", () => {
    expect(getRelativeLocaleUrlMock("tr", "posts/hello")).toBe(
      "/tr/posts/hello/"
    );
    expect(getRelativeLocaleUrlMock("ru", "posts/hello")).toBe(
      "/ru/posts/hello/"
    );
  });

  it("emits /<dir>/ for single-segment directory paths", () => {
    expect(getRelativeLocaleUrlMock("en", "posts")).toBe("/posts/");
    expect(getRelativeLocaleUrlMock("tr", "galleries")).toBe("/tr/galleries/");
  });

  it("emits / for the site root in the default locale", () => {
    expect(getRelativeLocaleUrlMock("en", "")).toBe("/");
  });

  it("emits /<locale>/ for the site root in a non-default locale", () => {
    expect(getRelativeLocaleUrlMock("tr", "")).toBe("/tr/");
  });

  it("preserves nested directory structure under the locale folder", () => {
    expect(getRelativeLocaleUrlMock("en", "posts/examples/portfolio")).toBe(
      "/posts/examples/portfolio/"
    );
    expect(getRelativeLocaleUrlMock("tr", "galleries/trips/sample-walk")).toBe(
      "/tr/galleries/trips/sample-walk/"
    );
  });

  it("strips a leading slash on the path argument", () => {
    expect(getRelativeLocaleUrlMock("en", "/posts/hello")).toBe(
      "/posts/hello/"
    );
    expect(getRelativeLocaleUrlMock("tr", "/posts/hello")).toBe(
      "/tr/posts/hello/"
    );
  });

  it("is idempotent on an already-trailing-slashed path", () => {
    expect(getRelativeLocaleUrlMock("en", "posts/hello/")).toBe(
      "/posts/hello/"
    );
    expect(getRelativeLocaleUrlMock("en", "posts/hello///")).toBe(
      "/posts/hello/"
    );
  });

  it("never produces a double trailing slash", () => {
    const out = getRelativeLocaleUrlMock("en", "posts/hello/");
    expect(out).not.toMatch(/\/{2,}$/);
    const out2 = getRelativeLocaleUrlMock("tr", "posts/hello/");
    expect(out2).not.toMatch(/\/{2,}$/);
  });
});
