import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";

export const BLOG_PATH = "src/content/posts";
export const PROJECTS_PATH = "src/content/projects";
export const GALLERIES_PATH = "src/content/galleries";

/**
 * Shared frontmatter fields used by every content collection that has
 * dates, slugs, OG image, or canonical URL. Collection-specific
 * extensions (like `tags`, `images`, `tech`) are layered on top via
 * `.extend(...)`. Keeping the contract in one place ensures a typo or
 * default flip doesn't silently drift across posts/projects/galleries
 * — and any new collection that follows the same shape gets the
 * conventions for free.
 */
function sharedFrontmatter() {
  // M — A naive `pubDatetime: 2025-09-12T10:30:00` in YAML coerces
  // via `new Date(str)` which honours the BUILD MACHINE's local
  // timezone, producing a DIFFERENT absolute UTC instant on macOS
  // dev vs. UTC CI vs. production Linux. The previous schema
  // (`z.union([z.string(), z.date()])`) accepted either, but the
  // string branch could land on a naive datetime AND the date
  // branch could too (YAML's native timestamp interpretation) —
  // silently producing different `<lastmod>` across environments.
  //
  // The fix: a `z.string()` with a regex that REQUIRES an explicit
  // timezone marker (`Z`, `+HH:MM`, `-HH:MM`). `z.date()` is
  // deliberately NOT in the union: YAML 1.2 interprets a bare
  // `pubDatetime: 2025-09-12T10:30:00Z` (no quotes) as a native
  // Date via `new Date(str)`, which is exactly the cross-env drift
  // vector this fix is closing. Requiring `z.string()` forces
  // authors to quote the value (`pubDatetime: "2025-09-12T10:30:00Z"`)
  // so the value reaches our schema as a string, the regex checks
  // the TZ marker, and `parseDateInTz` does the final resolution.
  // YAML Date instances (unquoted + Z) now FAIL the schema with a
  // clear "expected string" error pointing at the drift vector.
  //
  // Valid shapes:
  //   pubDatetime: "2025-09-12T10:30:00Z"        → string, Z marker
  //   pubDatetime: "2025-09-12T10:30:00+07:00"  → string, offset marker
  //   pubDatetime: "2025-09-12T10:30:00-0500"   → string, offset (no colon)
  // Invalid shapes that now fail loud:
  //   pubDatetime: 2025-09-12T10:30:00Z         → YAML Date, not a string
  //   pubDatetime: "2025-09-12T10:30:00"        → naive, regex-rejected
  //   pubDatetime: 2025-09-12T10:30:00          → YAML Date + naive drift
  const dateField = z
    .string()
    .regex(
      /[Zz]$|[+-]\d{2}:?\d{2}$/,
      "pubDatetime / modDatetime strings must include an explicit timezone marker (Z, +HH:MM, -HH:MM); naive datetimes silently drift across build environments"
    );
  /**
   * Optional URL-slug override. When present, this value is used as the
   * route segment instead of the on-disk filename. Must be a relative
   * path (no leading slash, no `..`); `/`-separated segments are
   * allowed, e.g. `"guides/e2e-testing"`. Authors rename URLs without
   * renaming files via this field.
   */
  const slug = z
    .string()
    .regex(/^[A-Za-z0-9_\-/]+$/)
    .optional();
  return {
    pubDatetime: dateField,
    modDatetime: dateField.optional().nullable(),
    draft: z.boolean().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
    timezone: z.string().optional(),
    slug,
  };
}

/**
 * Locale is derived from the leading folder under `posts/` (e.g.
 * `src/content/posts/tr/example.mdx`). `getLocaleFromPost()` reads the
 * prefix; if no recognised locale is found, the post defaults to the
 * default locale so legacy content kept at the root still renders.
 */
const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      ...sharedFrontmatter(),
      author: z.string().default(config.site.author),
      title: z.string(),
      featured: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      ogImage: z.union([image(), z.string()]).optional(),
      /**
       * Post description used for SEO meta, RSS feed, the post excerpt
       * card, and the `<!--more-->`-aware OG override in PostLayout.
       *
       * Optional: when missing, `utils/postDescription.ts` falls back to
       * the content up to a `<!-- more -->` separator so authors can
       * author an excerpt inline instead of duplicating it in frontmatter.
       */
      description: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      /**
       * Render a sticky right-rail table of contents on `lg+` viewports
       * (and a collapsible <details> fallback below). The TOC lists every
       * h2/h3 in the post body and scroll-spies the currently visible
       * heading. Authors opt in per post — short posts look awkward with
       * a one-item sidebar, so we don't render the TOC for posts with
       * fewer than 2 headings regardless of this flag.
       */
      tocAside: z.boolean().optional().default(false),
    }),
});

/**
 * A site-relative path (`/`, `/posts/foo/`) as opposed to an absolute
 * URL. The `(?!\/)` guard is load-bearing: a bare `startsWith("/")`
 * would also accept a protocol-relative `//evil.com`, which the
 * renderer would then classify as "internal" and emit as a same-tab
 * link with no `rel="noopener"` — an off-site navigation wearing an
 * on-site badge. Rejecting it at parse time keeps the component's
 * `startsWith("/")` check sound.
 */
const siteRelativePath = z
  .string()
  .regex(
    /^\/(?!\/)/,
    "must be an absolute URL or a site-relative path starting with '/'"
  );

const projects = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${PROJECTS_PATH}` }),
  schema: ({ image }) =>
    z.object({
      ...sharedFrontmatter(),
      ogImage: z.union([image(), z.string()]).optional(),
      title: z.string(),
      description: z.string(),
      summary: z.string().optional(),
      featured: z.boolean().optional(),
      tech: z.array(z.string()).default([]),
      role: z.string().optional(),
      status: z.enum(["shipped", "in-progress", "archived"]).default("shipped"),
      // Absolute URL (a real hosted demo) OR a site-relative path, so
      // the theme's own sample content can link to itself without
      // baking in a domain. An absolute URL here renders as an
      // external link (new tab); a `/path` renders as a normal
      // in-site link. See `ProjectDetailBody.astro`.
      demoUrl: z.union([z.url(), siteRelativePath]).optional(),
      // Stays absolute-only: this is a repo link, always off-site.
      sourceUrl: z.url().optional(),
      coverImage: z.union([image(), z.string()]).optional(),
      order: z.number().default(0),
    }),
});

/**
 * Image galleries (issue #553). One MDX file per gallery:
 *
 * src/content/galleries/<locale>/my-trip.mdx
 *
 * The page renders a uniform thumbnail grid that opens each image in a
 * PhotoSwipe v5 lightbox. Cover image is reused on the gallery card.
 * Gated at the route level by `features.enableGalleries` in
 * `astro-paper.config.ts`.
 */
const galleries = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${GALLERIES_PATH}` }),
  schema: ({ image }) =>
    z.object({
      ...sharedFrontmatter(),
      ogImage: z.union([image(), z.string()]).optional(),
      title: z.string(),
      description: z.string(),
      featured: z.boolean().optional(),
      coverImage: image().optional(),
      /**
       * Image list. `alt` is required (a11y + lightbox caption);
       * `caption` is the optional long-form caption shown beneath the
       * lightbox image. `width`/`height` are optional hints that let
       * Astro skip a network round-trip when computing image metadata.
       */
      images: z
        .array(
          z.object({
            src: image(),
            alt: z.string().min(1),
            caption: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          })
        )
        .min(1),
    }),
});

/**
 * Static pages (about, …). Same locale-aware folder layout as the
 * other collections: `src/content/pages/<locale>/<name>.mdx`.
 *
 * The single-page detail route at `src/pages/about.astro` loads the
 * active-locale page by id (`<locale>/about`) — same pattern as the
 * route handlers for posts/projects/galleries.
 */
const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
    // Pages intentionally do NOT spread `sharedFrontmatter()`. A
    // page is a one-off document (about, contact, …) and forcing a
    // `pubDatetime` on authors would push every page through the
    // post-style date validation. The single optional `timezone`
    // field mirrors what posts expose and is the only frontmatter
    // slot a page currently cares about. Add new page-level fields
    // here directly; reach for `sharedFrontmatter()` only if a
    // collection-wide date contract emerges.
    timezone: z.string().optional(),
  }),
});

export const collections = { posts, projects, galleries, pages };
