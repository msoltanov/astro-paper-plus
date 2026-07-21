import { describe, it, expect, afterEach, vi } from "vitest";
/**
 * The src/utils/withBase.ts module captures `import.meta.env.BASE_URL` at
 * load time. We test it by stubbing the env, then reloading the module via
 * `vi.resetModules()` + a fresh dynamic import.
 */
async function loadModuleWithBase(base: string) {
  vi.resetModules();
  vi.stubEnv("BASE_URL", base);
  return await import("@/utils/withBase");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("withBase — empty base ('/')", () => {
  it("stripBase leaves paths unchanged", async () => {
    const { stripBase } = await loadModuleWithBase("/");
    expect(stripBase("/posts/foo")).toBe("/posts/foo");
    expect(stripBase("/about")).toBe("/about");
  });

  it("stripLocale removes the locale prefix from a pathname", async () => {
    const { stripLocale } = await loadModuleWithBase("/");
    expect(stripLocale("/en/posts/foo", "en")).toBe("/posts/foo");
    expect(stripLocale("/tr/posts/foo", "tr")).toBe("/posts/foo");
    expect(stripLocale("/ru/posts/foo", "ru")).toBe("/posts/foo");
  });

  it("stripLocale returns / for the bare locale path", async () => {
    const { stripLocale } = await loadModuleWithBase("/");
    expect(stripLocale("/tr", "tr")).toBe("/");
  });

  it("stripLocale leaves non-matching paths unchanged", async () => {
    const { stripLocale } = await loadModuleWithBase("/");
    expect(stripLocale("/posts/foo", "en")).toBe("/posts/foo");
    expect(stripLocale("/about", "tr")).toBe("/about");
  });

  it("getAssetPath adds base prefix when there is no base", async () => {
    const { getAssetPath } = await loadModuleWithBase("/");
    expect(getAssetPath("favicon.svg")).toBe("/favicon.svg");
    expect(getAssetPath("/favicon.svg")).toBe("/favicon.svg");
  });
});

describe("withBase — sub-path base ('/blog')", () => {
  it("stripBase removes the leading /blog prefix", async () => {
    const { stripBase } = await loadModuleWithBase("/blog");
    expect(stripBase("/blog/posts/foo")).toBe("/posts/foo");
    expect(stripBase("/blog")).toBe("/");
    expect(stripBase("/blog/")).toBe("/");
  });

  it("stripBase leaves paths without the prefix unchanged", async () => {
    const { stripBase } = await loadModuleWithBase("/blog");
    expect(stripBase("/posts/foo")).toBe("/posts/foo");
  });

  it("getAssetPath includes the base prefix", async () => {
    const { getAssetPath } = await loadModuleWithBase("/blog");
    expect(getAssetPath("favicon.svg")).toBe("/blog/favicon.svg");
    expect(getAssetPath("/favicon.svg")).toBe("/blog/favicon.svg");
  });

  it("getAssetPath handles empty path with a trailing slash (T2-2 consistency)", async () => {
    // T2-2: the empty-input branch used to return no trailing slash
    // when `base !== ""` (`getAssetPath("")` → `/blog`), but the
    // non-empty branch always returned a trailing slash
    // (`getAssetPath("favicon.svg")` → `/blog/favicon.svg`). The
    // fix returns `baseRoot` (with the slash) for both branches so
    // callers don't have to make branch-dependent decisions about
    // whether a slash is present.
    //
    // Caller that depends on this contract: `HomePage.astro:162`
    // stores `getAssetPath("")` in `safeSession.backUrl` and the
    // BackButton uses it as the back-redirect href. Without the
    // fix, the stored URL would miss its trailing slash on a
    // sub-path deploy (`/blog` instead of `/blog/`); browsers
    // tolerate the difference via Astro's `trailingSlash: ignore`,
    // but the canonical / directory form is `/blog/`.
    const { getAssetPath } = await loadModuleWithBase("/blog");
    expect(getAssetPath("")).toBe("/blog/");
  });

  it("getAssetPath's empty path matches the trailing-slash shape of the non-empty path", async () => {
    // Belt-and-braces for T2-2: the empty-input branch and the
    // non-empty-branch should agree on the trailing-slash shape so
    // downstream URL concatenation doesn't see two different shapes
    // depending on whether the input was empty.
    const { getAssetPath } = await loadModuleWithBase("/blog");
    const empty = getAssetPath("");
    const nonEmpty = getAssetPath("favicon.svg");
    expect(empty.endsWith("/")).toBe(true);
    expect(nonEmpty.endsWith("/favicon.svg")).toBe(true);
    // The non-empty case prepends `empty + "favicon.svg"`:
    // confirming the shapes compose cleanly.
    expect(empty + "favicon.svg").toBe(nonEmpty);
  });

  it("getAssetPath('homePath-style') produces the same URL the HomePage backUrl fallback uses", async () => {
    // Consumer-side regression test for T2-2: HomePage.astro uses
    // `getAssetPath("")` as the `backUrl` fallback. We don't import
    // HomePage here (too heavy), but we pin the helper's output
    // shape so a future refactor that flips the trailing-slash
    // decision gets caught here.
    const { getAssetPath } = await loadModuleWithBase("/blog");
    expect(getAssetPath("")).toMatch(/\/$/);
    expect(getAssetPath("")).toBe("/blog/");
  });

  it("getAssetPath works with deep paths", async () => {
    const { getAssetPath } = await loadModuleWithBase("/blog");
    expect(getAssetPath("assets/js/main.js")).toBe("/blog/assets/js/main.js");
  });
});

describe("withBase — base with trailing slash ('/blog/')", () => {
  it("stripBase strips the base even with trailing slash in config", async () => {
    const { stripBase } = await loadModuleWithBase("/blog/");
    expect(stripBase("/blog/posts/foo")).toBe("/posts/foo");
  });
});
