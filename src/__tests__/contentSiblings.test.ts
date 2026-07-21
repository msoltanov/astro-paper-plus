import { describe, it, expect } from "vitest";
import type { CollectionEntry } from "astro:content";
import {
  buildContentTranslationGroups,
  findContentSiblings,
} from "@/utils/contentSiblings";

/**
 * `contentSiblings.ts` powers the cross-locale hreflang and
 * locale-switcher contracts for content detail pages (post,
 * project, gallery). It's the live-collection mirror of
 * `src/utils/sitemap.ts#buildTranslationGroups` (the sitemap
 * helper operates on filesystem-only `PostEntry` views because
 * the integration runs after Vite has torn down the
 * `astro:content` virtual module runner).
 *
 * These tests pin the contract that drives both
 * `<Layout>`'s `<link rel="alternate" hreflang>` emission and
 * `LocaleSwitcher`'s disabled-locale rendering. A future change
 * to `contentSlug.ts` (the locale-stripped translation key) or
 * `getContentUrl()` (the rendered URL) can't silently regress
 * the sitemap ↔ route parity without one of these tests failing.
 */

type PostsEntry = CollectionEntry<"posts">;
type ProjectsEntry = CollectionEntry<"projects">;
type GalleriesEntry = CollectionEntry<"galleries">;

const makePost = (
  id: string,
  filePath: string,
  data: Record<string, unknown> = {}
): PostsEntry =>
  ({
    id,
    filePath,
    data: data as PostsEntry["data"],
  }) as unknown as PostsEntry;

const makeProject = (
  id: string,
  filePath: string,
  data: Record<string, unknown> = {}
): ProjectsEntry =>
  ({
    id,
    filePath,
    data: data as ProjectsEntry["data"],
  }) as unknown as ProjectsEntry;

const makeGallery = (
  id: string,
  filePath: string,
  data: Record<string, unknown> = {}
): GalleriesEntry =>
  ({
    id,
    filePath,
    data: data as GalleriesEntry["data"],
  }) as unknown as GalleriesEntry;

// ─── buildContentTranslationGroups ────────────────────────────────────

describe("buildContentTranslationGroups (posts)", () => {
  it("groups posts that share a translation identity (file-path slug, NOT rendered slug)", () => {
    const groups = buildContentTranslationGroups("posts", [
      // EN override: frontmatter `slug` differs from file-path slug
      // — but the translation identity is still `/adding-new-post`.
      makePost(
        "en/adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        {
          slug: "adding-new-posts-in-astropaper-theme",
        }
      ),
      makePost(
        "ru/adding-new-post.mdx",
        "src/content/posts/ru/adding-new-post.mdx"
      ),
      makePost(
        "tr/adding-new-post.md",
        "src/content/posts/tr/adding-new-post.md"
      ),
    ]);

    // All three share the same translation key → one group.
    // Key shape matches `resolveContentSlug()`: `"/<segments>"`.
    expect(groups.size).toBe(1);
    const group = groups.get("/adding-new-post");
    expect(group?.size).toBe(3);
    expect(group?.get("en")).toBeDefined();
    expect(group?.get("ru")).toBeDefined();
    expect(group?.get("tr")).toBeDefined();
  });

  it("does NOT group posts whose file paths differ (different translations)", () => {
    const groups = buildContentTranslationGroups("posts", [
      makePost("en/foo.mdx", "src/content/posts/en/foo.mdx"),
      makePost("ru/bar.mdx", "src/content/posts/ru/bar.mdx"),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get("/foo")?.size).toBe(1);
    expect(groups.get("/bar")?.size).toBe(1);
  });
});

// ─── findContentSiblings ─────────────────────────────────────────────

describe("findContentSiblings (posts)", () => {
  it("returns the sibling locales for a fully-translated post in deterministic LOCALES order", () => {
    const posts = [
      makePost(
        "en/adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        { slug: "adding-new-posts-in-astropaper-theme" }
      ),
      makePost(
        "ru/adding-new-post.mdx",
        "src/content/posts/ru/adding-new-post.mdx"
      ),
      makePost(
        "tr/adding-new-post.md",
        "src/content/posts/tr/adding-new-post.md"
      ),
    ];
    const groups = buildContentTranslationGroups("posts", posts);
    const sib = findContentSiblings("posts", posts[0]!, groups);

    // LOCALES order is en, ru, tr.
    expect(sib.availableLocales).toEqual(["en", "ru", "tr"]);
  });

  it("honours each sibling's frontmatter slug override in hrefByLocale (H4 fix)", () => {
    const posts = [
      // EN ships under an override.
      makePost(
        "en/adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        { slug: "adding-new-posts-in-astropaper-theme" }
      ),
      // ru/tr stay bare.
      makePost(
        "ru/adding-new-post.mdx",
        "src/content/posts/ru/adding-new-post.mdx"
      ),
      makePost(
        "tr/adding-new-post.md",
        "src/content/posts/tr/adding-new-post.md"
      ),
    ];
    const groups = buildContentTranslationGroups("posts", posts);
    const sib = findContentSiblings("posts", posts[0]!, groups);

    // EN entry uses the override URL — the post's own locale is in
    // its own hrefByLocale slot, mirroring the route shape.
    // Trailing-slash shape mirrors the production runtime and the
    // canonical `astro:i18n` mock in `src/__tests__/setup.ts` (H8).
    expect(sib.hrefByLocale.en).toBe(
      "/posts/adding-new-posts-in-astropaper-theme/"
    );
    expect(sib.hrefByLocale.ru).toBe("/ru/posts/adding-new-post/");
    expect(sib.hrefByLocale.tr).toBe("/tr/posts/adding-new-post/");
  });

  it("returns only the current post's own locale when no translations exist (truthful availableLocales)", () => {
    // The whole point of the H6 fix: don't promise locales that 404.
    const posts = [makePost("en/solo.mdx", "src/content/posts/en/solo.mdx")];
    const groups = buildContentTranslationGroups("posts", posts);
    const sib = findContentSiblings("posts", posts[0]!, groups);

    expect(sib.availableLocales).toEqual(["en"]);
    expect(sib.hrefByLocale.en).toBe("/posts/solo/");
    // No sibling → other locales don't appear in hrefByLocale.
    expect(sib.hrefByLocale.ru).toBeUndefined();
    expect(sib.hrefByLocale.tr).toBeUndefined();
  });

  it("emits availableLocales in LOCALES order regardless of post input order", () => {
    // Reverse the order — the result must still be LOCALES-ordered
    // (en, ru, tr) so the rendered switcher doesn't shuffle.
    const posts = [
      makePost(
        "tr/adding-new-post.md",
        "src/content/posts/tr/adding-new-post.md"
      ),
      makePost(
        "ru/adding-new-post.mdx",
        "src/content/posts/ru/adding-new-post.mdx"
      ),
      makePost(
        "en/adding-new-post.mdx",
        "src/content/posts/en/adding-new-post.mdx",
        { slug: "adding-new-posts-in-astropaper-theme" }
      ),
    ];
    const groups = buildContentTranslationGroups("posts", posts);
    const sib = findContentSiblings("posts", posts[0]!, groups);

    expect(sib.availableLocales).toEqual(["en", "ru", "tr"]);
  });
});

describe("findContentSiblings (projects)", () => {
  it("emits per-locale project URLs across all supported locales when translations exist", () => {
    // Project detail pages now use the same hreflang machinery as
    // post detail (was emitting no hreflang before).
    const projects = [
      makeProject("en/astropaper.md", "src/content/projects/en/astropaper.md"),
      makeProject("ru/astropaper.md", "src/content/projects/ru/astropaper.md"),
      makeProject("tr/astropaper.md", "src/content/projects/tr/astropaper.md"),
    ];
    const groups = buildContentTranslationGroups("projects", projects);
    const sib = findContentSiblings("projects", projects[0]!, groups);

    expect(sib.availableLocales).toEqual(["en", "ru", "tr"]);
    expect(sib.hrefByLocale.en).toBe("/projects/astropaper/");
    expect(sib.hrefByLocale.ru).toBe("/ru/projects/astropaper/");
    expect(sib.hrefByLocale.tr).toBe("/tr/projects/astropaper/");
  });

  it("returns only the project's own locale when no project translations exist", () => {
    const projects = [
      makeProject("en/astropaper.md", "src/content/projects/en/astropaper.md"),
    ];
    const groups = buildContentTranslationGroups("projects", projects);
    const sib = findContentSiblings("projects", projects[0]!, groups);

    expect(sib.availableLocales).toEqual(["en"]);
    expect(sib.hrefByLocale.en).toBe("/projects/astropaper/");
    expect(sib.hrefByLocale.ru).toBeUndefined();
  });
});

describe("findContentSiblings (galleries)", () => {
  it("emits per-locale gallery URLs across all supported locales when translations exist", () => {
    const galleries = [
      makeGallery(
        "en/sample-walk.mdx",
        "src/content/galleries/en/sample-walk.mdx"
      ),
      makeGallery(
        "ru/sample-walk.mdx",
        "src/content/galleries/ru/sample-walk.mdx"
      ),
      makeGallery(
        "tr/sample-walk.mdx",
        "src/content/galleries/tr/sample-walk.mdx"
      ),
    ];
    const groups = buildContentTranslationGroups("galleries", galleries);
    const sib = findContentSiblings("galleries", galleries[0]!, groups);

    expect(sib.availableLocales).toEqual(["en", "ru", "tr"]);
    expect(sib.hrefByLocale.en).toBe("/galleries/sample-walk/");
    expect(sib.hrefByLocale.ru).toBe("/ru/galleries/sample-walk/");
    expect(sib.hrefByLocale.tr).toBe("/tr/galleries/sample-walk/");
  });

  it("groups galleries by file-path slug, ignoring frontmatter slug overrides", () => {
    // Translation identity is the file-path slug (NOT the frontmatter
    // override), so two galleries with the same file slug but
    // different rendered slugs land in the same group.
    const galleries = [
      makeGallery(
        "en/photo-tour.mdx",
        "src/content/galleries/en/photo-tour.mdx",
        { slug: "summer-2025-photos" }
      ),
      makeGallery(
        "ru/photo-tour.mdx",
        "src/content/galleries/ru/photo-tour.mdx"
      ),
    ];
    const groups = buildContentTranslationGroups("galleries", galleries);
    expect(groups.size).toBe(1);
    const sib = findContentSiblings("galleries", galleries[0]!, groups);
    // EN URL honours the override; RU uses the bare file-path slug.
    expect(sib.hrefByLocale.en).toBe("/galleries/summer-2025-photos/");
    expect(sib.hrefByLocale.ru).toBe("/ru/galleries/photo-tour/");
  });
});

// ─── filtered-group invariant ────────────────────────────────────────

describe("findContentSiblings — filtered group invariant (P2)", () => {
  it("does not advertise a sibling that the page-level filter dropped", () => {
    // The P2 regression: a default-locale gallery is draft /
    // scheduled, so the default-locale route's `getStaticPaths`
    // filters it out (no page rendered). The translated routes must
    // not still advertise a `/galleries/<slug>/` link from the
    // locale switcher / hreflang cluster — clicking it would 404.
    //
    // The fix is route-level: build `translationGroups` from the
    // same `galleryFilter`-pruned set every page iterates. The unit
    // test below pins the invariant by feeding a filtered set into
    // `buildContentTranslationGroups` and asserting the result.
    const en = makeGallery(
      "en/sample-walk.mdx",
      "src/content/galleries/en/sample-walk.mdx",
      { draft: true }
    );
    const ru = makeGallery(
      "ru/sample-walk.mdx",
      "src/content/galleries/ru/sample-walk.mdx"
    );
    const tr = makeGallery(
      "tr/sample-walk.mdx",
      "src/content/galleries/tr/sample-walk.mdx"
    );
    const allEntries = [en, ru, tr];
    // Mimic `galleryFilter`: drop the draft default-locale entry.
    const renderable = allEntries.filter(e => !e.data.draft);
    expect(renderable).toEqual([ru, tr]);

    const groups = buildContentTranslationGroups("galleries", renderable);
    expect(groups.size).toBe(1);
    const sib = findContentSiblings("galleries", ru, groups);

    // The default-locale entry was filtered — neither it nor its
    // URL may appear in the sibling map for the ru page.
    expect(sib.availableLocales).toEqual(["ru", "tr"]);
    expect(sib.hrefByLocale.en).toBeUndefined();
    expect(sib.hrefByLocale.ru).toBe("/ru/galleries/sample-walk/");
    expect(sib.hrefByLocale.tr).toBe("/tr/galleries/sample-walk/");
  });

  it("still reports the full sibling set when nothing is filtered out", () => {
    // Sanity guard for the fix above: the filtered-group shape must
    // not over-prune. When every entry passes the filter, all
    // locales remain in the sibling map.
    const en = makeGallery(
      "en/sample-walk.mdx",
      "src/content/galleries/en/sample-walk.mdx"
    );
    const ru = makeGallery(
      "ru/sample-walk.mdx",
      "src/content/galleries/ru/sample-walk.mdx"
    );
    const tr = makeGallery(
      "tr/sample-walk.mdx",
      "src/content/galleries/tr/sample-walk.mdx"
    );
    const renderable = [en, ru, tr];

    const groups = buildContentTranslationGroups("galleries", renderable);
    const sib = findContentSiblings("galleries", ru, groups);
    expect(sib.availableLocales).toEqual(["en", "ru", "tr"]);
    expect(sib.hrefByLocale.en).toBe("/galleries/sample-walk/");
    expect(sib.hrefByLocale.ru).toBe("/ru/galleries/sample-walk/");
    expect(sib.hrefByLocale.tr).toBe("/tr/galleries/sample-walk/");
  });
});
