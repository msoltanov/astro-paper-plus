import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

/**
 * Source-contract parity / override-propagation test for every route and
 * card that produces a content-collection URL. Guards four invariants:
 *
 *   1. Post routes share `src/scripts/postEnhancements.ts` and do not
 *      carry inline `define:vars` blocks (the original D-2 bug).
 *   2. Post routes pass `post.data.slug` through `getPostSlug` /
 *      `getPostUrl` and into prev/next-post navigation (D-3, D-5, D-6).
 *   3. Project + gallery routes do the same for their slug helpers
 *      (D-7: route-level slug override propagation).
 *   4. Listing cards forward `data.slug` to their respective URL
 *      helpers, otherwise card links would 404 when a post declares an
 *      override.
 */

const here = dirname(urlToPath(import.meta.url));
const root = (rel: string) => resolve(here, rel);
const defaults = {
  post: root("../pages/posts/[...slug]/index.astro"),
  localePost: root("../pages/[locale]/posts/[...slug].astro"),
  postAdjacent: root("../components/post/AdjacentPostNav.astro"),
  defaultOgPng: root("../pages/posts/[...slug]/index.png.ts"),
  localeOgPng: root("../pages/[locale]/posts/[...slug]/index.png.ts"),
  postOgImageHelper: root("../utils/postOgImage.ts"),
  defaultProject: root("../pages/projects/[...slug].astro"),
  localeProject: root("../pages/[locale]/projects/[...slug].astro"),
  // R1: the galleries route reshuffle moved the path-emission
  // logic (slug derivation + filter chain) into
  // `src/utils/featurePages.ts` so the same code is unit-testable
  // AND so the static-index gate (R1) actually fires. The
  // `[locale]/galleries/[...slug].astro` sibling keeps its own
  // self-contained path emission because its `[locale]` segment
  // already provides the dynamic gating.
  defaultGallery: root("../utils/featurePages.ts"),
  localeGallery: root("../pages/[locale]/galleries/[...slug].astro"),
  featurePages: root("../utils/featurePages.ts"),
  enhancements: root("../scripts/postEnhancements.ts"),
  card: root("../components/Card.astro"),
  projectCard: root("../components/ProjectCard.astro"),
  galleryCard: root("../components/GalleryCard.astro"),
  schema: root("../content.config.ts"),
};

const read = (p: string) => readFileSync(p, "utf8");

describe("post routes — enhancement script parity (D-2)", () => {
  it("installProgressBar no longer carries an unused _host parameter", () => {
    // Earlier revisions exposed `_host: RootWithEnhancements` on
    // `installProgressBar` for shape-symmetry with `installCopyButtons`.
    // The function only needs `document` — host was dead weight. The
    // test pins the clean signature so a future "let's symmetrize
    // this again" doesn't reintroduce the unused parameter.
    const enh = read(defaults.enhancements);
    expect(enh).toMatch(
      /function\s+installProgressBar\s*\(\s*\)\s*:\s*\(\s*\)\s*=>\s*void/
    );
    // And the call site doesn't pass it — must be exactly `installProgressBar()`
    // with no argument. The `[^)]+` requires at least one char inside the
    // parens, so the bare-call form passes the `toMatch` and the
    // rejected-with-arguments form fails the `not.toMatch`.
    expect(enh).toMatch(/installProgressBar\(\)/);
    expect(enh).not.toMatch(/installProgressBar\([^)]+\)/);
  });

  it("installCopyButtons still takes the host so the <pre> query stays scoped to <main>", () => {
    // Sibling regression guard: dropping _host from installProgressBar
    // shouldn't trigger a follow-up that drops host from
    // installCopyButtons too.
    const enh = read(defaults.enhancements);
    expect(enh).toMatch(
      /function\s+installCopyButtons\s*\(\s*host\s*:\s*HTMLElement/
    );
  });

  it("default-locale route imports initPostEnhancements + rebinds after swaps", () => {
    const s = read(defaults.post);
    expect(s).toMatch(/initPostEnhancements/);
    expect(s).toMatch(
      /document\.addEventListener\(\s*["']astro:after-swap["']\s*,\s*initPostEnhancements/
    );
  });

  it("per-locale route imports initPostEnhancements + rebinds after swaps", () => {
    const s = read(defaults.localePost);
    expect(s).toMatch(/initPostEnhancements/);
    expect(s).toMatch(
      /document\.addEventListener\(\s*["']astro:after-swap["']\s*,\s*initPostEnhancements/
    );
  });

  it("neither route rolls its own inline copy/progress script", () => {
    expect(read(defaults.post)).not.toMatch(/define:vars=/);
    expect(read(defaults.localePost)).not.toMatch(/define:vars=/);
  });

  it("shared enhancements module is the single implementation", () => {
    const s = read(defaults.enhancements);
    expect(s).toMatch(/function installProgressBar/);
    expect(s).toMatch(/function installCopyButtons/);
    expect(s).toMatch(/export function initPostEnhancements/);
  });

  it("both routes declare data-copy-label and data-copied-label on <main>", () => {
    // C3 route-dedup: the `data-*` attrs now live in the shared
    // `PostDetailBody.astro` body, used by both routes. Source-contract
    // assertion is on the body, not the routes themselves — the routes
    // are thin wrappers that import the body and forward props.
    const body = read(root("../components/PostDetailBody.astro"));
    expect(body).toMatch(/data-copy-label=\{t\.post\.copy\}/);
    expect(body).toMatch(/data-copied-label=\{t\.post\.copied\}/);
  });
});

describe("post routes — slug override propagation (D-3, D-5, D-6)", () => {
  it("getPostSlugSegments is called with post.data.slug in both routes (T2-4: route-param shape, no leading slash)", () => {
    expect(read(defaults.post)).toMatch(
      /getPostSlugSegments\(\s*post\.id\s*,\s*post\.filePath\s*,\s*post\.data\.slug/
    );
    expect(read(defaults.localePost)).toMatch(
      /getPostSlugSegments\(\s*post\.id\s*,\s*post\.filePath\s*,\s*post\.data\.slug/
    );
  });

  it("getStaticPaths forwards prev/next slug through to AdjacentPostNav", () => {
    for (const p of [defaults.post, defaults.localePost]) {
      const s = read(p);
      // Pins the literal-source contract that `prevPost` / `nextPost`
      // carry the previous/next post's `data.slug` so card-level slug
      // overrides (D-3 / D-5 / D-6) reach AdjacentPostNav →
      // getPostUrl(). Accepts the `prevInList` / `nextInList`
      // local-bindings used after the variable-naming cleanup
      // (issues.md M5) or the direct `sortedPosts[index ± 1]` form.
      expect(s).toMatch(
        /prevPost:[\s\S]*?slug:\s*(?:sortedPosts\[index\s*\+\s*1\]|prevInList)\.data\.slug/
      );
      expect(s).toMatch(
        /nextPost:[\s\S]*?slug:\s*(?:sortedPosts\[index\s*-\s*1\]|nextInList)\.data\.slug/
      );
    }
  });

  it("AdjacentPostNav signature includes slug?: string", () => {
    const s = read(defaults.postAdjacent);
    expect(s).toMatch(/type AdjacentPost\s*=\s*\{[\s\S]*?slug\?:\s*string/);
  });

  it("AdjacentPostNav forwards prevPost.slug / nextPost.slug to getPostUrl", () => {
    const s = read(defaults.postAdjacent);
    expect(s).toMatch(
      /getPostUrl\(\s*prevPost\.id\s*,\s*prevPost\.filePath\s*,\s*locale\s*,\s*prevPost\.slug/
    );
    expect(s).toMatch(
      /getPostUrl\(\s*nextPost\.id\s*,\s*nextPost\.filePath\s*,\s*locale\s*,\s*nextPost\.slug/
    );
  });

  it("posts/[...slug]/index.png.ts uses getPostSlugSegments with data.slug (T2-4)", () => {
    const s = read(defaults.defaultOgPng);
    expect(s).toMatch(
      /getPostSlugSegments\(\s*post\.id\s*,\s*post\.filePath\s*,\s*post\.data\.slug/
    );
  });

  it("Card component forwards data.slug to getPostUrl", () => {
    // M — Card accepts an explicit `locale` prop (defaulting to
    // Astro.currentLocale). The contract is "locale first, then
    // data.slug"; verify either path is preserved.
    expect(read(defaults.card)).toMatch(
      /getPostUrl\(\s*id\s*,\s*filePath\s*,\s*locale\s*,\s*data\.slug/
    );
  });
});

describe("project + gallery routes — slug override propagation (D-7)", () => {
  it("schemas declare `slug` for posts, projects, AND galleries", () => {
    const s = read(defaults.schema);
    // `slug` is defined in a shared `sharedFrontmatter()` factory and
    // spread into all three collections (`...sharedFrontmatter()`).
    // Pins two invariants the factory refactor must keep:
    //   1. The factory exposes a `slug` zod field (so per-collection
    //      schemas can pick it up via spread).
    //   2. All three collections consume the factory (otherwise D-3,
    //      D-5, D-6, D-7 propagation breaks).
    expect(s).toMatch(/function\s+sharedFrontmatter\s*\(\s*\)/);
    expect(s).toMatch(/\.\.\.sharedFrontmatter\(\)/g);
    const spreads = s.match(/\.\.\.sharedFrontmatter\(\)/g) ?? [];
    // One spread per collection (posts, projects, galleries). Pages is
    // intentionally exempt — it's a static page collection without slug.
    expect(
      spreads.length,
      "shared frontmatter spread across collections"
    ).toBeGreaterThanOrEqual(3);
  });

  it("project routes pass project.data.slug to getProjectSlugSegments (T2-4)", () => {
    for (const p of [defaults.defaultProject, defaults.localeProject]) {
      const s = read(p);
      expect(s).toMatch(
        /getProjectSlugSegments\(\s*project\.id\s*,\s*project\.filePath[^,]*,\s*project\.data\.slug/
      );
    }
  });

  it("gallery routes pass entry.data.slug to getGallerySlugSegments (T2-4)", () => {
    for (const p of [defaults.defaultGallery, defaults.localeGallery]) {
      const s = read(p);
      expect(s).toMatch(
        /getGallerySlugSegments\([\s\S]*?(?:entry|gallery)\.data\.slug/
      );
    }
  });

  it("ProjectCard forwards project.data.slug", () => {
    expect(read(defaults.projectCard)).toMatch(
      /getProjectUrl\(\s*project\.id\s*,\s*project\.filePath[^,]*,\s*locale\s*,\s*project\.data\.slug/
    );
  });

  it("GalleryCard forwards gallery.data.slug", () => {
    expect(read(defaults.galleryCard)).toMatch(
      /getGalleryUrl\(\s*gallery\.id\s*,\s*gallery\.filePath[^,]*,\s*locale\s*,\s*gallery\.data\.slug/
    );
  });

  it("filters default-locale gallery detail paths", () => {
    const source = read(defaults.defaultGallery);
    expect(source).toMatch(/import\s+\{\s*galleryFilter\s*\}/);
    // The page list and the translation group must derive from the
    // same `galleryFilter`-pruned set — a draft default-locale
    // entry must not be advertised as a sibling on translated
    // pages. The route therefore reads `all` once, prunes with
    // `galleryFilter` into `renderable`, partitions `renderable`
    // for the page list, and feeds `renderable` to
    // `buildContentTranslationGroups` (not the unfiltered
    // `allEntries`, which is the P2 regression shape).
    expect(source).not.toMatch(
      /galleriesByLocale\(DEFAULT_LOCALE\)\(entry\)\s*&&\s*galleryFilter\(entry\)/
    );
    expect(source).toMatch(
      /\.filter\(\s*galleryFilter\s*\)\s*;[\s\S]{0,200}\.filter\(\s*galleriesByLocale\(DEFAULT_LOCALE\)\s*\)/
    );
    expect(source).toMatch(
      /buildContentTranslationGroups\(\s*["']galleries["']\s*,\s*renderable\s*\)/
    );
  });

  it("per-locale gallery detail paths also build sibling groups from the filtered set", () => {
    // Mirror of the P2 fix on the per-locale route: `allEntries`
    // (unfiltered) is gone, `renderable` is the input to both the
    // per-locale partition and `buildContentTranslationGroups`.
    const source = read(defaults.localeGallery);
    expect(source).not.toMatch(
      /buildContentTranslationGroups\(\s*["']galleries["']\s*,\s*allEntries\s*\)/
    );
    expect(source).toMatch(
      /buildContentTranslationGroups\(\s*["']galleries["']\s*,\s*renderable\s*\)/
    );
  });

  it("uses the shared localized project status helper", () => {
    // C3 route-dedup: the project status rendering lives in
    // `ProjectDetailBody.astro`, imported by both project routes. Check
    // the body (the canonical source) and the project card; the routes
    // are now thin wrappers that forward the project entry.
    for (const path of [
      defaults.projectCard,
      root("../components/ProjectDetailBody.astro"),
    ]) {
      const source = read(path);
      expect(source).toMatch(/projectStatusLabel/);
      expect(source).not.toMatch(/>\s*\{status\}\s*</);
    }
  });
});

describe("dynamic OG image endpoints — D-8 (per-locale 404 regression)", () => {
  it("both default-locale and per-locale OG image endpoints exist on disk", () => {
    // The D-8 regression: per-locale post pages referenced
    // `<locale>/posts/<slug>/index.png` for og:image but only the
    // default-locale endpoint existed. Both must now live next to
    // their respective post routes.
    expect(existsSync(defaults.defaultOgPng)).toBe(true);
    expect(existsSync(defaults.localeOgPng)).toBe(true);
  });

  it("default-locale endpoint imports the shared renderPostOgPng helper", () => {
    expect(read(defaults.defaultOgPng)).toMatch(/renderPostOgPng/);
  });

  it("per-locale endpoint imports the shared renderPostOgPng helper", () => {
    expect(read(defaults.localeOgPng)).toMatch(/renderPostOgPng/);
  });

  it("postOgImage helper exists and exports the three contracts", () => {
    const s = read(defaults.postOgImageHelper);
    expect(s).toMatch(/export\s+(async\s+)?function renderPostOgPng/);
    expect(s).toMatch(/export\s+function\s+postOgImageFallback/);
    expect(s).toMatch(/export\s+function\s+pngBody/);
  });

  it("default-locale and per-locale endpoints stay in lock-step on the shared helper (no copy-paste divergence)", () => {
    // Both endpoints should delegate to `renderPostOgPng`. A future
    // PR that copy-pastes the Satori block back into either
    // endpoint breaks the next passing build; the gate's readFileSync
    // assertion catches it.
    const def = read(defaults.defaultOgPng);
    const loc = read(defaults.localeOgPng);
    expect(def).toMatch(/renderPostOgPng\(\{/);
    expect(loc).toMatch(/renderPostOgPng\(\{/);
    expect(def).not.toMatch(/import\s+satori\s+from\s*["']satori["']/);
    expect(loc).not.toMatch(/import\s+satori\s+from\s*["']satori["']/);
  });

  it("both endpoints wrap renderPostOgPng in try/catch with the fallback", () => {
    // T0-1: a Satori crash inside `renderPostOgPng` (vendored font
    // bytes unreadable, font path missing in the prerender chunk —
    // see T0-2) must NOT 500 the build. The default-locale endpoint
    // wraps the call in `try { ... } catch { return postOgImageFallback(); }`;
    // the per-locale endpoint must mirror that contract. Without this
    // parity the build aborts on the first per-locale OG endpoint.
    const tryCatchAroundRender =
      /try\s*\{[\s\S]*?renderPostOgPng[\s\S]*?\}\s*catch\b/;
    const fallbackInCatch = /\}\s*catch\b[\s\S]*?postOgImageFallback\(\)/;
    expect(read(defaults.defaultOgPng)).toMatch(tryCatchAroundRender);
    expect(read(defaults.localeOgPng)).toMatch(tryCatchAroundRender);
    expect(read(defaults.defaultOgPng)).toMatch(fallbackInCatch);
    expect(read(defaults.localeOgPng)).toMatch(fallbackInCatch);
  });
});
