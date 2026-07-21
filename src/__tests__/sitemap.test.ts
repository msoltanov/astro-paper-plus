import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  parsePostUrl,
  loadPostsFromDisk,
  buildPostsLookup,
  buildTranslationGroups,
  postLastmod,
  shapePages,
  maxLastmod,
  collectHtmlHreflang,
  type PostEntry,
} from "@/utils/sitemap";

const BASE = "https://astro-paper-plus.pages.dev";
const DEFAULT_TZ = "Asia/Ashgabat"; // matches astro-paper.config.ts

// ─── Fixtures ──────────────────────────────────────────────────────────

/**
 * Builds a fresh temp content tree for a single test and cleans it up
 * afterwards. mkdtempSync guarantees a unique prefix per test.
 */
const withFixture = (
  fixture: Record<string, string>,
  fn: (dir: string) => void
): void => {
  const dir = mkdtempSync(join(tmpdir(), "sitemap-test-"));
  try {
    for (const [relPath, contents] of Object.entries(fixture)) {
      const abs = join(dir, relPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, contents);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const post = (
  id: string,
  filePath: string,
  data: Partial<PostEntry["data"]> = {}
): PostEntry =>
  ({
    id,
    filePath,
    data: {
      pubDatetime: new Date("2020-01-01T00:00:00Z"),
      ...data,
    },
  }) as PostEntry;

const page = (pathname: string) => ({ pathname });

// ─── parsePostUrl ──────────────────────────────────────────────────────

describe("parsePostUrl", () => {
  it("extracts locale + slug from a default-locale post URL", () => {
    expect(parsePostUrl(`${BASE}/posts/adding-new-post/`, BASE)).toEqual({
      locale: "en",
      slug: "adding-new-post",
    });
  });

  it("extracts locale + slug from a non-default-locale post URL", () => {
    expect(parsePostUrl(`${BASE}/ru/posts/adding-new-post/`, BASE)).toEqual({
      locale: "ru",
      slug: "adding-new-post",
    });
    expect(parsePostUrl(`${BASE}/tr/posts/adding-new-post/`, BASE)).toEqual({
      locale: "tr",
      slug: "adding-new-post",
    });
  });

  it("preserves nested slugs (sub-folder posts)", () => {
    expect(parsePostUrl(`${BASE}/posts/examples/portfolio/`, BASE)).toEqual({
      locale: "en",
      slug: "examples/portfolio",
    });
    expect(parsePostUrl(`${BASE}/ru/posts/examples/portfolio/`, BASE)).toEqual({
      locale: "ru",
      slug: "examples/portfolio",
    });
  });

  it("tolerates URLs with no trailing slash", () => {
    expect(parsePostUrl(`${BASE}/posts/foo`, BASE)).toEqual({
      locale: "en",
      slug: "foo",
    });
  });

  it("rejects the listing index /posts/", () => {
    expect(parsePostUrl(`${BASE}/posts/`, BASE)).toBeNull();
  });

  it("returns the slug for /posts/<n>/ and /<locale>/posts/<n>/ (callers disambiguate via the post lookup)", () => {
    // Purely-numeric single-segment slugs are AMBIGUOUS at the URL
    // level: Astro's pagination route renders `/posts/<n>/` when
    // `<n>` matches a page index, but a real post can also carry
    // a numeric slug (e.g. `slug: "2026"` or `2026.md`). The parser
    // can't tell — only the post set can. It returns the parsed
    // slug and `shapePages` consults the lookup: a hit → posts
    // chunk with lastmod/hreflang; a miss → pages chunk (the
    // pagination path). The previous version short-circuited on
    // numeric slugs here and silently dropped valid numeric-slug
    // posts from the sitemap.
    expect(parsePostUrl(`${BASE}/posts/2/`, BASE)).toEqual({
      locale: "en",
      slug: "2",
    });
    expect(parsePostUrl(`${BASE}/posts/10/`, BASE)).toEqual({
      locale: "en",
      slug: "10",
    });
    expect(parsePostUrl(`${BASE}/ru/posts/3/`, BASE)).toEqual({
      locale: "ru",
      slug: "3",
    });
    expect(parsePostUrl(`${BASE}/tr/posts/7/`, BASE)).toEqual({
      locale: "tr",
      slug: "7",
    });
  });

  it("does NOT reject slugs that merely contain digits", () => {
    // Real slugs can include digits (`post-2026`, `2026-review`),
    // so the guard is strictly "every character is a digit", not
    // "any character is a digit".
    expect(parsePostUrl(`${BASE}/posts/post-2026/`, BASE)).toEqual({
      locale: "en",
      slug: "post-2026",
    });
    expect(parsePostUrl(`${BASE}/posts/2026-review/`, BASE)).toEqual({
      locale: "en",
      slug: "2026-review",
    });
  });

  it("does NOT reject nested slugs whose first segment is purely numeric", () => {
    // Regression: the previous guard ran `^\d+$` on the first slug
    // segment unconditionally, so `/posts/2026/recap/` (a valid
    // nested post slug — the schema accepts `slug: "2026/recap"`
    // and the routes emit it verbatim) was mis-classified as a
    // pagination URL and dropped from the sitemap's posts chunk.
    // Only the SINGLE-SEGMENT shapes `/posts/<n>/` and
    // `/<locale>/posts/<n>/` are pagination — multi-segment
    // numeric-leading slugs are real posts.
    expect(parsePostUrl(`${BASE}/posts/2026/recap/`, BASE)).toEqual({
      locale: "en",
      slug: "2026/recap",
    });
    expect(parsePostUrl(`${BASE}/ru/posts/2026/recap/`, BASE)).toEqual({
      locale: "ru",
      slug: "2026/recap",
    });
    expect(parsePostUrl(`${BASE}/tr/posts/2026/recap/`, BASE)).toEqual({
      locale: "tr",
      slug: "2026/recap",
    });
    // And a three-segment numeric-leading slug is also fine.
    expect(parsePostUrl(`${BASE}/posts/2026/01/january/`, BASE)).toEqual({
      locale: "en",
      slug: "2026/01/january",
    });
  });

  it("rejects non-post routes", () => {
    expect(parsePostUrl(`${BASE}/about/`, BASE)).toBeNull();
    expect(parsePostUrl(`${BASE}/tags/foo/`, BASE)).toBeNull();
    expect(parsePostUrl(`${BASE}/galleries/`, BASE)).toBeNull();
    expect(parsePostUrl(`${BASE}/`, BASE)).toBeNull();
    expect(parsePostUrl(BASE, BASE)).toBeNull();
  });

  it("rejects URLs whose leading segment is not a recognised locale", () => {
    expect(parsePostUrl(`${BASE}/something/posts/foo/`, BASE)).toBeNull();
  });

  it("rejects URLs outside the configured base URL", () => {
    expect(
      parsePostUrl(`https://other.example.com/posts/foo/`, BASE)
    ).toBeNull();
  });

  // ─── H — locale-prefix collision guard ──────────────────────────
  // The previous greedy regex `^/(?:(en|ru|tr)/)?posts/(.+?)/?$` would
  // mis-parse a post whose slug BEGINS with a locale code as a per-
  // locale URL. The fix walks segments and only consumes a locale
  // segment when the NEXT segment is literally `posts`.
  it("H: does NOT mis-classify a default-locale post whose slug begins with a locale code", () => {
    expect(parsePostUrl(`${BASE}/posts/en-trip-2026/`, BASE)).toEqual({
      locale: "en",
      slug: "en-trip-2026",
    });
    expect(parsePostUrl(`${BASE}/posts/ru-tour/`, BASE)).toEqual({
      locale: "en",
      slug: "ru-tour",
    });
    expect(parsePostUrl(`${BASE}/posts/tr-news/`, BASE)).toEqual({
      locale: "en",
      slug: "tr-news",
    });
  });

  it("H: preserves nested-slug post slugs that begin with a locale code", () => {
    expect(parsePostUrl(`${BASE}/posts/guides/en-setup/`, BASE)).toEqual({
      locale: "en",
      slug: "guides/en-setup",
    });
  });
});

// ─── loadPostsFromDisk ────────────────────────────────────────────────

describe("loadPostsFromDisk", () => {
  it("returns one entry per routable post across locales", () => {
    withFixture(
      {
        "posts/en/adding-new-post.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
        "posts/ru/adding-new-post.mdx":
          '---\npubDatetime: "2025-02-01T00:00:00Z"\n---\nТело',
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        expect(entries).toHaveLength(2);
        const ids = entries.map(e => e.id).sort();
        expect(ids).toEqual([
          "posts/en/adding-new-post",
          "posts/ru/adding-new-post",
        ]);
      }
    );
  });

  it("parses CRLF frontmatter with a quoted trailing scalar", () => {
    withFixture(
      {
        "posts/en/crlf-post.mdx":
          '---\r\npubDatetime: "2025-01-15T00:00:00Z"\r\ndescription: "Quoted trailing scalar"\r\n---\r\nBody',
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        expect(entries.map(entry => entry.id)).toEqual(["posts/en/crlf-post"]);
      }
    );
  });

  it("skips drafts", () => {
    withFixture(
      {
        "posts/en/published.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
        "posts/en/draft.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\ndraft: true\n---\nBody',
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        expect(entries.map(e => e.id)).toEqual(["posts/en/published"]);
      }
    );
  });

  it("includes posts under `_`-prefixed folders (mirrors the content-collection glob, which only excludes filenames starting with `_`)", () => {
    withFixture(
      {
        "posts/en/release.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
        "posts/en/_releases/internal.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        // `walkFiles` yields raw `readdirSync` order, which is
        // filesystem-dependent: NTFS collates (so `release.md` lands
        // before `_releases/`, since uppercased `R` 0x52 < `_` 0x5F)
        // while ext4's hashed dir_index order is arbitrary. Sequence
        // carries no meaning — `writeChunk` re-sorts by URL before
        // serialising (src/integrations/sitemap.ts:307) and the two
        // chunks split by kind, not by count — so assert membership,
        // not order. Mirrors the sorted assertion further up.
        expect([...entries.map(e => e.id)].sort()).toEqual([
          "posts/en/_releases/internal",
          "posts/en/release",
        ]);
      }
    );
  });

  it("captures modDatetime + timezone when present", () => {
    withFixture(
      {
        "posts/en/post.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\nmodDatetime: "2026-06-03T00:00:00Z"\ntimezone: Asia/Bangkok\n---\nBody',
      },
      dir => {
        const [entry] = loadPostsFromDisk(dir);
        expect(entry.data.modDatetime).toBe("2026-06-03T00:00:00Z");
        expect(entry.data.timezone).toBe("Asia/Bangkok");
      }
    );
  });

  it("drops entries that lack pubDatetime", () => {
    withFixture(
      {
        "posts/en/no-date.md": "---\ntitle: No date\n---\nBody",
        "posts/en/has-date.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        expect(entries.map(e => e.id)).toEqual(["posts/en/has-date"]);
      }
    );
  });

  it("does not throw on malformed frontmatter", () => {
    withFixture(
      {
        "posts/en/malformed.md": "--\npubDatetime: :\nbroken: [yaml",
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        // Malformed → empty frontmatter → no pubDatetime → entry dropped.
        expect(entries).toEqual([]);
      }
    );
  });

  it("returns empty for a missing directory (fail-open)", () => {
    withFixture({}, dir => {
      // No posts dir exists under the fixture.
      expect(loadPostsFromDisk(dir)).toEqual([]);
    });
  });

  it("includes root-level posts under src/content/posts/ (default-locale fallback)", () => {
    // Files directly under `postsDir` (no locale subfolder) are valid
    // default-locale entries — the content glob and `getLocaleFromPost`
    // both honour this layout. The sitemap walk must visit them.
    withFixture(
      {
        "posts/hello.md": '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
        "posts/en/inside.mdx":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        const ids = entries.map(e => e.id).sort();
        expect(ids).toEqual(["posts/en/inside", "posts/hello"]);
        const root = entries.find(e => e.id === "posts/hello")!;
        expect(root.filePath).toBe("posts/hello.md");
      }
    );
  });

  it("excludes scheduled posts whose pubDatetime is beyond the configured margin", () => {
    // 1 hour in the future — well past the default 15-minute margin.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    withFixture(
      {
        "posts/en/published.md": `---\npubDatetime: ${past}\n---\nBody`,
        "posts/en/scheduled.md": `---\npubDatetime: ${future}\n---\nBody`,
      },
      dir => {
        const entries = loadPostsFromDisk(dir);
        expect(entries.map(e => e.id)).toEqual(["posts/en/published"]);
      }
    );
  });

  it("honours a custom scheduledMarginMs override", () => {
    // 30 minutes in the future — past the default 15-min margin.
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    withFixture(
      {
        "posts/en/future.md": `---\npubDatetime: ${future}\n---\nBody`,
      },
      dir => {
        expect(loadPostsFromDisk(dir)).toEqual([]);
        expect(
          loadPostsFromDisk(dir, undefined, "UTC", 60 * 60 * 1000)
        ).toHaveLength(1);
      }
    );
  });

  // R8: a top-level symlink under `posts/` (e.g. `posts/ru → posts/en`
  // mis-bound by an editor, or a stray junction from a pnpm workspace
  // setup) must NOT be followed. The previous
  // `readdirSync(postsDir)` + `statSync(localeDir)` shape resolved
  // the symlink and descended into the target, either recursing
  // until ELOOP or double-counting the same locale. After the
  // dirent-based fix, the locale loop's `isDirectory()` reports the
  // LINK type, so the symlink is skipped and the entries from
  // `posts/en/` are surfaced exactly once.
  //
  // Cross-platform note: creating symlinks on Windows requires
  // either admin privileges or Developer Mode. CI runners (linux)
  // and most contributor machines have this; bare-bones Windows
  // boxes can fail with EPERM. The test detects that case and
  // bails to a no-op rather than falsely failing.
  it("ignores top-level symlinks under posts/ (does not follow them)", () => {
    withFixture(
      {
        "posts/en/real.md":
          '---\npubDatetime: "2025-01-15T00:00:00Z"\n---\nBody',
      },
      dir => {
        const linkPath = join(dir, "posts", "symlinked-locale");
        try {
          symlinkSync(join(dir, "posts", "en"), linkPath, "dir");
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EPERM") {
            // Symlinks unsupported on this host — nothing to assert.
            return;
          }
          throw err;
        }
        const entries = loadPostsFromDisk(dir);
        // Only the real `posts/en/real` entry should appear. If the
        // symlink were followed, we'd either double-count (same id,
        // duplicate entries) or hit ELOOP and crash.
        const ids = entries.map(e => e.id).sort();
        expect(ids).toEqual(["posts/en/real"]);
        // And the symlink path must not show up as an entry.
        expect(
          entries.find(e => e.filePath?.includes("symlinked-locale"))
        ).toBeUndefined();
      }
    );
  });
});

// ─── collectHtmlHreflang ──────────────────────────────────────────────

describe("collectHtmlHreflang", () => {
  const writeHtml = (
    absDir: string,
    segments: string[],
    html: string
  ): void => {
    const dir = join(absDir, ...segments);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
  };

  const HREFLANG_HTML = (entryUrl: string): string => `
<head>
<link rel="alternate" hreflang="en" href="${BASE}/projects/${entryUrl}/" />
<link rel="alternate" hreflang="ru" href="${BASE}/ru/projects/${entryUrl}/" />
<link rel="alternate" hreflang="x-default" href="${BASE}/projects/${entryUrl}/" />
</head>`;

  it("finds nested-slug detail pages (recurses through subdirectories)", () => {
    withFixture({}, distDir => {
      writeHtml(
        distDir,
        ["projects", "astropaper"],
        HREFLANG_HTML("astropaper")
      );
      writeHtml(
        distDir,
        ["projects", "web", "site-rewrite"],
        HREFLANG_HTML("web/site-rewrite")
      );
      const map = collectHtmlHreflang(distDir, "projects", BASE);
      expect(map.has("projects/astropaper/")).toBe(true);
      expect(map.has("projects/web/site-rewrite/")).toBe(true);
      expect(map.get("projects/web/site-rewrite/")?.en).toBe(
        `${BASE}/projects/web/site-rewrite/`
      );
    });
  });

  it("discovers locale-prefixed nested slug pages", () => {
    withFixture({}, distDir => {
      writeHtml(
        distDir,
        ["ru", "projects", "web", "site-rewrite"],
        HREFLANG_HTML("web/site-rewrite").replace("/projects/", "/ru/projects/")
      );
      const map = collectHtmlHreflang(distDir, "projects", BASE);
      expect(map.has("ru/projects/web/site-rewrite/")).toBe(true);
    });
  });

  it("skips `_`-prefixed subdirectories (e.g. dist/_astro/)", () => {
    withFixture({}, distDir => {
      writeHtml(distDir, ["projects", "_astro"], "<html></html>");
      writeHtml(
        distDir,
        ["projects", "astropaper"],
        HREFLANG_HTML("astropaper")
      );
      const map = collectHtmlHreflang(distDir, "projects", BASE);
      expect(map.has("projects/astropaper/")).toBe(true);
      expect(map.size).toBe(1);
    });
  });
});

// ─── buildPostsLookup ──────────────────────────────────────────────────

describe("buildPostsLookup", () => {
  it("keys posts by locale|slug", () => {
    const enPost = post(
      "en/adding-new-post.mdx",
      "posts/en/adding-new-post.mdx"
    );
    const ruPost = post(
      "ru/adding-new-post.mdx",
      "posts/ru/adding-new-post.mdx"
    );
    const lookup = buildPostsLookup([enPost, ruPost]);
    expect(lookup.get("en|adding-new-post")).toBe(enPost);
    expect(lookup.get("ru|adding-new-post")).toBe(ruPost);
  });

  it("preserves nested-folder slugs in the key", () => {
    const nested = post(
      "en/examples/portfolio-website-development.mdx",
      "posts/en/examples/portfolio-website-development.mdx"
    );
    const lookup = buildPostsLookup([nested]);
    expect(lookup.get("en|examples/portfolio-website-development")).toBe(
      nested
    );
  });

  it("strips private-folder prefixes from the key", () => {
    const release = post(
      "en/_releases/astro-paper-6.md",
      "posts/en/_releases/astro-paper-6.md"
    );
    const lookup = buildPostsLookup([release]);
    expect(lookup.get("en|astro-paper-6")).toBe(release);
  });

  it("treats slugs with pipe-like characters as distinct keys", () => {
    const a = post("foo.mdx", "posts/en/foo.mdx");
    const b = post("en|foo.mdx", "posts/en/en|foo.mdx");
    const lookup = buildPostsLookup([a, b]);
    expect(lookup.size).toBe(2);
    expect(lookup.get("en|foo")).toBe(a);
    expect(lookup.get("en|en|foo")).toBe(b);
  });

  it("falls back to id-only when filePath is missing", () => {
    // Real-world: Astro gives id like `posts/en/adding-new-post` (with
    // the `posts/` collection prefix).
    const fallback = post(
      "posts/en/adding-new-post.mdx",
      undefined as unknown as string
    );
    const lookup = buildPostsLookup([fallback]);
    expect(lookup.get("en|adding-new-post")).toBe(fallback);
  });
});

// ─── postLastmod ───────────────────────────────────────────────────────

describe("postLastmod", () => {
  it("uses modDatetime when set", () => {
    const iso = postLastmod(
      post("x.md", "posts/en/x.mdx", {
        pubDatetime: new Date("2020-01-01T00:00:00Z"),
        modDatetime: new Date("2026-06-03T00:00:00Z"),
      }),
      DEFAULT_TZ
    );
    expect(iso).toBe("2026-06-03T00:00:00.000Z");
  });

  it("falls back to pubDatetime when modDatetime is null", () => {
    const iso = postLastmod(
      post("x.md", "posts/en/x.mdx", {
        pubDatetime: new Date("2020-01-01T00:00:00Z"),
        modDatetime: null,
      }),
      DEFAULT_TZ
    );
    expect(iso).toBe("2020-01-01T00:00:00.000Z");
  });

  it("falls back to pubDatetime when modDatetime is undefined", () => {
    const iso = postLastmod(
      post("x.md", "posts/en/x.mdx", {
        pubDatetime: new Date("2020-01-01T00:00:00Z"),
      }),
      DEFAULT_TZ
    );
    expect(iso).toBe("2020-01-01T00:00:00.000Z");
  });

  it("respects post-level timezone for ambiguous strings", () => {
    // IANA's `Etc/GMT-14` is UTC-14 (sign convention inverted from
    // POSIX). A wall-clock 00:00 there is 14h BEHIND UTC.
    const iso = postLastmod(
      post("x.md", "posts/en/x.mdx", {
        pubDatetime: "2020-01-01T00:00:00",
        timezone: "Etc/GMT-14",
      }),
      DEFAULT_TZ
    );
    expect(iso).toBe("2019-12-31T10:00:00.000Z");
  });

  it("falls back to the site default timezone when the post omits one", () => {
    // Asia/Ashgabat = UTC+5. Wall-clock 00:00 there → 19:00 UTC prior day.
    const iso = postLastmod(
      post("x.md", "posts/en/x.mdx", {
        pubDatetime: "2020-01-01T00:00:00",
      }),
      DEFAULT_TZ
    );
    expect(iso).toBe("2019-12-31T19:00:00.000Z");
  });

  it("tolerates an invalid post-level timezone (delegates to parseDateInTz)", () => {
    // `Asia/Ashhabad` (typo) used to crash sitemap generation because
    // postLastmod called dayjs.tz directly without the parseDateInTz
    // fallback. Routes/RSS already tolerated this through parseDateInTz;
    // postLastmod now delegates so the sitemap gets the same fallback.
    // The fallback uses the host TZ, so we don't pin the absolute
    // instant — only that the call returned a parseable ISO string.
    const iso = postLastmod(
      post("x.md", "posts/en/x.mdx", {
        pubDatetime: "2025-07-15T10:30:00",
        timezone: "Asia/Ashhabad",
      }),
      DEFAULT_TZ
    );
    expect(typeof iso).toBe("string");
    expect(() => new Date(iso).toISOString()).not.toThrow();
  });
});

// ─── shapePages ────────────────────────────────────────────────────────

describe("shapePages", () => {
  const basePosts = [
    post("en/adding-new-post.mdx", "posts/en/adding-new-post.mdx", {
      pubDatetime: new Date("2025-01-15T00:00:00Z"),
      modDatetime: new Date("2026-06-03T00:00:00Z"),
    }),
    post("ru/adding-new-post.mdx", "posts/ru/adding-new-post.mdx", {
      pubDatetime: new Date("2025-02-01T00:00:00Z"),
      modDatetime: new Date("2026-06-04T00:00:00Z"),
    }),
    post("en/standalone.mdx", "posts/en/standalone.mdx", {
      pubDatetime: new Date("2025-03-01T00:00:00Z"),
    }),
  ];

  it("applies lastmod to post URLs and groups them into the posts chunk", () => {
    const lookup = buildPostsLookup(basePosts);
    const { posts: postItems, pages: pageItems } = shapePages(
      [page("/posts/adding-new-post/"), page("/about/")],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    expect(postItems.map(i => i.url)).toEqual([
      `${BASE}/posts/adding-new-post/`,
    ]);
    expect(postItems[0].lastmod).toBe("2026-06-03T00:00:00.000Z");
    expect(pageItems.map(i => i.url)).toEqual([`${BASE}/about/`]);
  });

  it("emits hreflang alternates when multiple locales share a slug", () => {
    const lookup = buildPostsLookup(basePosts);
    const { posts: postItems } = shapePages(
      [page("/posts/adding-new-post/"), page("/ru/posts/adding-new-post/")],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    expect(postItems).toHaveLength(2);
    for (const item of postItems) {
      expect(item.hreflang).toMatchObject({
        en: `${BASE}/posts/adding-new-post/`,
        ru: `${BASE}/ru/posts/adding-new-post/`,
      });
      // `x-default` falls through to the default-locale URL of the
      // slug — crawlers use it to pick a fallback language variant.
      expect(item.hreflang!["x-default"]).toBe(
        `${BASE}/posts/adding-new-post/`
      );
    }
  });

  it("omits hreflang when a slug exists in only one locale", () => {
    const lookup = buildPostsLookup(basePosts);
    const { posts: postItems } = shapePages(
      [page("/posts/standalone/")],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    expect(postItems[0].hreflang).toBeUndefined();
  });

  // ─── H4 regression — translation-identity hreflang ──────────────
  //
  // The fork's `adding-new-post.mdx` ships under slug override
  // `adding-new-posts-in-astropaper-theme` (EN), while the ru/tr
  // siblings ship under the bare filename-derived `adding-new-post`.
  // Before the H4 fix, these got grouped by RENDERED slug and the
  // EN entry was orphaned (no siblings in its slug group), and the
  // ru/tr cluster's `x-default` pointed at the non-existent
  // `/posts/adding-new-post/`. With the translation-identity grouping
  // (locale-stripped file path BEFORE slug override), all translations join.
  describe("H4 — translation-identity grouping", () => {
    const overridePosts = [
      post("en/adding-new-post.mdx", "posts/en/adding-new-post.mdx", {
        pubDatetime: new Date("2025-01-15T00:00:00Z"),
        slug: "adding-new-posts-in-astropaper-theme",
      }),
      post("ru/adding-new-post.mdx", "posts/ru/adding-new-post.mdx", {
        pubDatetime: new Date("2025-02-01T00:00:00Z"),
      }),
      post("tr/adding-new-post.md", "posts/tr/adding-new-post.md", {
        pubDatetime: new Date("2025-03-01T00:00:00Z"),
      }),
    ];

    it("groups siblings by translation identity (file-path slug, not rendered slug)", () => {
      const lookup = buildPostsLookup(overridePosts);
      const groups = buildTranslationGroups(overridePosts);

      // All three share the same translation key.
      expect(groups.size).toBe(1);
      const group = groups.get("adding-new-post");
      expect(group?.size).toBe(3);

      // The EN entry's RENDERED slug differs from its translation key.
      expect(
        lookup.get("en|adding-new-posts-in-astropaper-theme")
      ).toBeDefined();
      expect(lookup.get("en|adding-new-post")).toBeUndefined();
    });

    it("emits all sibling hreflangs on the EN page", () => {
      const lookup = buildPostsLookup(overridePosts);
      const groups = buildTranslationGroups(overridePosts);
      const { posts: postItems } = shapePages(
        [page("/posts/adding-new-posts-in-astropaper-theme/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        groups
      );
      expect(postItems).toHaveLength(1);
      // Each hreflang points at the sibling's actual rendered URL —
      // ru/tr keep their bare slug, EN keeps the override.
      expect(postItems[0].hreflang).toMatchObject({
        en: `${BASE}/posts/adding-new-posts-in-astropaper-theme/`,
        ru: `${BASE}/ru/posts/adding-new-post/`,
        tr: `${BASE}/tr/posts/adding-new-post/`,
      });
      // x-default points at the EN URL since EN is the default locale.
      expect(postItems[0].hreflang!["x-default"]).toBe(
        `${BASE}/posts/adding-new-posts-in-astropaper-theme/`
      );
    });

    it("emits all sibling hreflangs on each non-EN page", () => {
      const lookup = buildPostsLookup(overridePosts);
      const groups = buildTranslationGroups(overridePosts);
      const { posts: postItems } = shapePages(
        [
          page("/ru/posts/adding-new-post/"),
          page("/tr/posts/adding-new-post/"),
        ],
        BASE,
        lookup,
        DEFAULT_TZ,
        groups
      );
      expect(postItems).toHaveLength(2);
      for (const item of postItems) {
        expect(item.hreflang).toMatchObject({
          en: `${BASE}/posts/adding-new-posts-in-astropaper-theme/`,
          ru: `${BASE}/ru/posts/adding-new-post/`,
          tr: `${BASE}/tr/posts/adding-new-post/`,
        });
        expect(item.hreflang!["x-default"]).toBe(
          `${BASE}/posts/adding-new-posts-in-astropaper-theme/`
        );
      }
    });

    it("omits x-default when a translated post group has no default-locale sibling", () => {
      // Synthetic group: ru + tr only (no en). Per the Final Pass H4
      // verdict, x-default should only exist when the default-locale
      // sibling exists.
      const noEnPosts = [
        post("ru/only-here.mdx", "posts/ru/only-here.mdx", {
          pubDatetime: new Date("2025-01-01T00:00:00Z"),
        }),
        post("tr/only-here.md", "posts/tr/only-here.md", {
          pubDatetime: new Date("2025-01-01T00:00:00Z"),
        }),
      ];
      const lookup = buildPostsLookup(noEnPosts);
      const groups = buildTranslationGroups(noEnPosts);
      const { posts: postItems } = shapePages(
        [page("/ru/posts/only-here/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        groups
      );
      expect(postItems[0].hreflang).toMatchObject({
        ru: `${BASE}/ru/posts/only-here/`,
        tr: `${BASE}/tr/posts/only-here/`,
      });
      expect(postItems[0].hreflang).not.toHaveProperty("x-default");
    });
  });

  it("treats /posts/N/ pagination URLs as pages (no post match)", () => {
    const lookup = buildPostsLookup(basePosts);
    const { posts: postItems, pages: pageItems } = shapePages(
      [page("/posts/2/")],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    expect(postItems).toEqual([]);
    expect(pageItems.map(i => i.url)).toEqual([`${BASE}/posts/2/`]);
  });

  // Regression — `/posts/N/` is ambiguous between a pagination
  // route and a real post with a numeric slug (`slug: "2026"` /
  // `2026.md`). The disambiguation now lives in `shapePages`'s
  // lookup step: a hit → posts chunk with lastmod + hreflang;
  // a miss → pages chunk. The previous implementation
  // short-circuited at the URL parser and dropped legitimate
  // numeric-slug posts from the posts chunk.
  it("treats /posts/N/ with a real numeric-slug post as a post (lastmod + hreflang)", () => {
    const numericPost = post("en/2026.md", "posts/en/2026.md", {
      pubDatetime: new Date("2026-01-01T00:00:00Z"),
      modDatetime: new Date("2026-06-03T00:00:00Z"),
    });
    const ruNumericPost = post("ru/2026.md", "posts/ru/2026.md", {
      pubDatetime: new Date("2026-01-01T00:00:00Z"),
    });
    const lookup = buildPostsLookup([numericPost, ruNumericPost]);
    const { posts: postItems, pages: pageItems } = shapePages(
      [
        page("/posts/2026/"),
        page("/ru/posts/2026/"),
        // Sibling control — `/posts/2/` has no real post under
        // slug "2", so it stays in the pages chunk as pagination.
        page("/posts/2/"),
      ],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    // Both numeric-slug posts land in the posts chunk.
    expect(postItems).toHaveLength(2);
    expect(postItems.map(i => i.url)).toEqual([
      `${BASE}/posts/2026/`,
      `${BASE}/ru/posts/2026/`,
    ]);
    expect(postItems[0].lastmod).toBe("2026-06-03T00:00:00.000Z");
    // Hreflang cluster spans the locale siblings (both share the
    // translation key "2026" — derived from filename by
    // `contentSlug`/`deriveSlugFromFilePath`).
    const enItem = postItems.find(i => i.url === `${BASE}/posts/2026/`)!;
    expect(enItem.hreflang).toMatchObject({
      en: `${BASE}/posts/2026/`,
      ru: `${BASE}/ru/posts/2026/`,
      "x-default": `${BASE}/posts/2026/`,
    });
    // Pure pagination (no real post) still falls through.
    expect(pageItems.map(i => i.url)).toEqual([`${BASE}/posts/2/`]);
  });

  // Companion — a slug-override numeric post also routes via the
  // same lookup. The post's `data.slug` is the rendered URL
  // segment; the lookup key is `locale|slug`.
  it("treats /posts/<n>/ where n is a numeric slug-override as a post", () => {
    const numericOverride = post("en/year-2026.mdx", "posts/en/year-2026.mdx", {
      pubDatetime: new Date("2026-01-01T00:00:00Z"),
      slug: "2026",
    });
    const lookup = buildPostsLookup([numericOverride]);
    const { posts: postItems, pages: pageItems } = shapePages(
      [page("/posts/2026/")],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    expect(postItems).toHaveLength(1);
    expect(postItems[0].url).toBe(`${BASE}/posts/2026/`);
    expect(pageItems).toEqual([]);
  });

  it("preserves nested-slug post URLs", () => {
    const nested = post(
      "en/examples/portfolio.mdx",
      "posts/en/examples/portfolio.mdx"
    );
    const lookup = buildPostsLookup([nested]);
    const { posts: postItems } = shapePages(
      [page("/posts/examples/portfolio/")],
      BASE,
      lookup,
      DEFAULT_TZ
    );
    expect(postItems[0].url).toBe(`${BASE}/posts/examples/portfolio/`);
  });

  describe("static-route hreflang (H7 fix)", () => {
    // The integration passes a pathname → hreflang map to shapePages
    // for the non-post static routes (home, about, posts index,
    // projects index, galleries index). These tests pin the contract
    // that the resolver is consulted, the full cluster is emitted,
    // and unknown pages get no hreflang.

    const staticHreflang = new Map<string, Readonly<Record<string, string>>>([
      [
        "about",
        {
          en: `${BASE}/about/`,
          ru: `${BASE}/ru/about/`,
          tr: `${BASE}/tr/about/`,
          "x-default": `${BASE}/about/`,
        },
      ],
      [
        "ru/about",
        {
          en: `${BASE}/about/`,
          ru: `${BASE}/ru/about/`,
          tr: `${BASE}/tr/about/`,
          "x-default": `${BASE}/about/`,
        },
      ],
      [
        "posts",
        {
          en: `${BASE}/posts/`,
          ru: `${BASE}/ru/posts/`,
          tr: `${BASE}/tr/posts/`,
          "x-default": `${BASE}/posts/`,
        },
      ],
    ]);

    it("attaches the full hreflang cluster to a matched static page", () => {
      const lookup = buildPostsLookup(basePosts);
      const { pages: pageItems } = shapePages(
        [page("/about/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        staticHreflang
      );
      expect(pageItems).toHaveLength(1);
      expect(pageItems[0].hreflang).toEqual({
        en: `${BASE}/about/`,
        ru: `${BASE}/ru/about/`,
        tr: `${BASE}/tr/about/`,
        "x-default": `${BASE}/about/`,
      });
    });

    it("includes the SELF locale in the cluster (no self-filter)", () => {
      // H7 regression: previous build filtered the active locale
      // out. For /ru/about/ the cluster must still include the ru
      // entry so search engines see a complete hreflang set.
      const lookup = buildPostsLookup(basePosts);
      const { pages: pageItems } = shapePages(
        [page("/ru/about/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        staticHreflang
      );
      expect(pageItems[0].hreflang!["ru"]).toBe(`${BASE}/ru/about/`);
    });

    it("emits the same cluster for both /about/ and /ru/about/", () => {
      // H7 contract: the hreflang cluster is the same regardless of
      // which locale variant of the page is being shaped — every URL
      // in the cluster must be in the same set, just with a
      // different "self" entry.
      const lookup = buildPostsLookup(basePosts);
      const { pages: enPages } = shapePages(
        [page("/about/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        staticHreflang
      );
      const { pages: ruPages } = shapePages(
        [page("/ru/about/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        staticHreflang
      );
      expect(enPages[0].hreflang).toEqual(ruPages[0].hreflang);
    });

    it("emits no hreflang for static pages that aren't in the map", () => {
      // E.g. /posts/2/ — pagination, not a static route.
      const lookup = buildPostsLookup(basePosts);
      const { pages: pageItems } = shapePages(
        [page("/posts/2/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        staticHreflang
      );
      expect(pageItems[0].hreflang).toBeUndefined();
    });

    it("mixes hreflang-bearing and hreflang-less pages in the same shapePages call", () => {
      const lookup = buildPostsLookup(basePosts);
      const { pages: pageItems } = shapePages(
        [page("/about/"), page("/posts/2/"), page("/posts/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        staticHreflang
      );
      expect(pageItems).toHaveLength(3);
      expect(pageItems[0].hreflang).toBeDefined();
      expect(pageItems[1].hreflang).toBeUndefined();
      expect(pageItems[2].hreflang).toBeDefined();
    });

    it("attaches project detail hreflang harvested from built HTML", () => {
      // Mirrors what the integration does at build time: walk
      // `dist/projects/<entry>/index.html` for each entry, parse
      // out the hreflang cluster, key by pathname. Here the
      // `staticHreflang` map is hand-built to simulate the
      // harvest result for `astropaper` (the project's only entry
      // across the supported locales).
      //
      // Astro's `pages` array reports pathnames WITH a leading
      // slash; the integration's collector strips them off
      // (matching the static-route map keys) so the map keys
      // here are slash-less.
      const projectHreflang = new Map<string, Readonly<Record<string, string>>>(
        [
          [
            "projects/astropaper",
            {
              en: `${BASE}/projects/astropaper/`,
              ru: `${BASE}/ru/projects/astropaper/`,
              tr: `${BASE}/tr/projects/astropaper/`,
              "x-default": `${BASE}/projects/astropaper/`,
            },
          ],
          [
            "ru/projects/astropaper",
            {
              en: `${BASE}/projects/astropaper/`,
              ru: `${BASE}/ru/projects/astropaper/`,
              tr: `${BASE}/tr/projects/astropaper/`,
              "x-default": `${BASE}/projects/astropaper/`,
            },
          ],
        ]
      );
      const lookup = buildPostsLookup(basePosts);
      const { pages: pageItems } = shapePages(
        [page("/projects/astropaper/"), page("/ru/projects/astropaper/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        projectHreflang
      );
      expect(pageItems).toHaveLength(2);
      for (const item of pageItems) {
        // Same cluster for both — the cluster is the project's
        // translation identity, not a per-locale URL.
        expect(item.hreflang).toEqual({
          en: `${BASE}/projects/astropaper/`,
          ru: `${BASE}/ru/projects/astropaper/`,
          tr: `${BASE}/tr/projects/astropaper/`,
          "x-default": `${BASE}/projects/astropaper/`,
        });
      }
    });

    it("emits no hreflang for project detail pages not in the static map", () => {
      // The map exists but the project isn't in it (e.g. a
      // translation-only entry that hasn't been added yet).
      const lookup = buildPostsLookup(basePosts);
      const { pages: pageItems } = shapePages(
        [page("/projects/astropaper/")],
        BASE,
        lookup,
        DEFAULT_TZ,
        undefined,
        new Map() // empty map
      );
      expect(pageItems[0].hreflang).toBeUndefined();
    });
  });
});

// ─── maxLastmod ────────────────────────────────────────────────────────

describe("maxLastmod", () => {
  it("returns undefined for empty input", () => {
    expect(maxLastmod([])).toBeUndefined();
  });

  it("ignores undefined values", () => {
    expect(maxLastmod([undefined, "2026-01-01T00:00:00.000Z", undefined])).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("returns the lexicographically greatest ISO string", () => {
    expect(
      maxLastmod([
        "2024-01-01T00:00:00.000Z",
        "2026-06-03T00:00:00.000Z",
        "2025-12-31T23:59:59.999Z",
      ])
    ).toBe("2026-06-03T00:00:00.000Z");
  });
});
