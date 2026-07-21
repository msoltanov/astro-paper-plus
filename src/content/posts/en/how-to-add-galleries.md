---
author: astro-paper-plus
pubDatetime: "2026-07-06T00:00:00.000Z"
title: "How to add image galleries"
tags:
  - docs
description: "Add image galleries to AstroPaper+ — a feature-gated /galleries/ section with per-gallery pages, a PhotoSwipe v5 lightbox, and full i18n (en/ru/tr)."
---

AstroPaper+ ships with an optional **galleries** content collection (see issue #553). Each gallery is a single MDX file with a list of images; the detail page renders a responsive thumbnail grid that opens each image in a **PhotoSwipe v5** lightbox with keyboard nav, swipe / pinch zoom, and preloading of neighbouring shots.

## Table of contents

## Enabling the feature

The feature is **opt-in** — it stays disabled by default so existing sites aren't surprised by a new top-level route. Flip the toggle in `astro-paper.config.ts`:

```ts
features: {
  // ... existing flags ...
  enableGalleries: true,
},
```

The toggle controls three things at once:

- the `/galleries/` listing and `/galleries/<slug>` detail pages are built,
- the **Galleries** entry appears in the header nav,
- and the locale switcher threads gallery URLs through the current page to all supported locales.

When the toggle is `false`, the routes return an empty `getStaticPaths()`, so no orphan URLs leak into the sitemap or are linked from anywhere.

## Folder layout

```
src/content/galleries/
  en/
    sample-walk.mdx
    japan-2025.mdx
  ru/
    sample-walk.mdx
    japan-2025.mdx
  tr/
    ...
  _assets/        # ← shared images, ignored by the loader
    cover.svg
    photo-1.jpg
    photo-2.jpg
```

Locale is derived from the leading folder — same convention as `posts/` and `projects/`. Folders starting with `_` are skipped by the glob loader, so `_assets/` is a safe shared bucket.

## Authoring a gallery

Frontmatter matches the `galleries` collection schema:

```mdx
---
title: "Japan 2025"
description: "Three weeks in Tokyo, Kyoto, Osaka."
pubDatetime: "2026-04-12T08:30:00.000Z"
featured: true
coverImage: ../_assets/japan-cover.jpg
images:
  - src: ../_assets/japan-01.jpg
    alt: "Tokyo skyline from Shibuya Sky"
    caption: "Day 1 — Shibuya at dusk"
  - src: ../_assets/japan-02.jpg
    alt: "Fushimi Inari shrine torii gates"
    caption: "Day 4 — Fushimi Inari at sunrise"
  - src: ../_assets/japan-03.jpg
    alt: "Cherry blossoms along the Philosopher's Path"
    caption: "Day 9 — Kyoto in bloom"
---

The body of the file is regular MDX — story text, captions, links,
even other embeds. The thumbnail grid is rendered automatically from
the `images` list below your prose.
```

Notes:

- `images` is **required** (the schema enforces `z.array(...).min(1)`).
- `alt` on every image is **required** — PhotoSwipe uses it as the accessibility label and the caption fallback.
- `width` / `height` on each image are optional hints. Astro's `image()` schema helper extracts real dimensions from the file, so omitting them is fine.
- `coverImage` is what shows on the gallery **card** (`/galleries/` listing). If you skip it, the card shows a "No cover" placeholder.
- `featured: true` floats a gallery to the top of the listing, mirroring the same flag in `posts/` and `projects/`.
- `draft: true` hides the gallery in production (always visible in `dev`, same rule as posts).
- `pubDatetime` + `timezone` honour the same scheduled-margin knob as posts — anything dated further than `content.scheduledPostMargin` in the future is held back.

## How the lightbox works

PhotoSwipe v5 is dynamically imported on demand via `src/scripts/galleryLightbox.ts`. The CSS ships only on the gallery detail page (bundled into the page stylesheet via a side-effect import). Neither ships on the rest of the site, so the home page, post detail pages, and the projects section pay zero bytes for the gallery UI.

The thumbnail grid uses `data-pswp-*` markup so users without JavaScript still get a working click-through to the full image in a new tab (`target="_blank" rel="noopener"`). When JS is enabled, PhotoSwipe intercepts the click and opens the in-page overlay with:

- arrow-key / swipe navigation between images,
- pinch / double-tap zoom,
- close-button or click-outside dismiss,
- preloading of the next + previous image.

The lightbox re-initialises after every Astro view transition (the `astro:after-swap` handler), so client-side navigation between galleries keeps the gallery interactive without a full reload.

## i18n

Every UI string is translated and routed through the existing `tplStr` placeholder system used elsewhere:

| Key                                                         | Purpose                                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `nav.galleries`                                             | header nav label                            |
| `pages.galleriesTitle` / `galleriesDesc` / `galleriesEmpty` | listing page h1, intro, empty state         |
| `gallery.viewGallery`                                       | card CTA                                    |
| `gallery.openGallery`                                       | aria-label on the card link                 |
| `gallery.backToList`                                        | per-page "back" link                        |
| `gallery.ofLabel`                                           | "N of M" counter inside the lightbox        |
| `gallery.photoCount` (`PluralForms`)                        | card badge (CLDR pluralised via `plural()`) |

Adding a new language means updating `src/i18n/types.ts`, the relevant `src/i18n/lang/<code>.ts` file, and `LOCALES` in `src/i18n/locales.ts` — same flow as the rest of the template.

## Files added / changed

| Path                                               | Why                                                |
| -------------------------------------------------- | -------------------------------------------------- |
| `astro-paper.config.ts`                            | new `enableGalleries` toggle                       |
| `src/content.config.ts`                            | new `galleries` collection                         |
| `src/utils/getGalleryPaths.ts`                     | locale-aware slug / URL helpers                    |
| `src/utils/galleriesByLocale.ts`                   | `getCollection` filter                             |
| `src/utils/galleryFilter.ts`                       | draft + scheduled-margin filter                    |
| `src/utils/getSortedGalleries.ts`                  | featured-first, then newest-first sort             |
| `src/utils/getLocaleFromPost.ts`                   | now also recognises the `galleries` collection dir |
| `src/components/GalleryCard.astro`                 | listing card                                       |
| `src/components/Header.astro`                      | conditional "Galleries" nav link                   |
| `src/styles/global.css`                            | `.pswp-gallery a` prose-override safety net        |
| `src/scripts/galleryLightbox.ts`                   | PhotoSwipe initializer                             |
| `src/pages/galleries/index.astro`                  | list (default locale)                              |
| `src/pages/galleries/[...slug].astro`              | detail (default locale)                            |
| `src/pages/[locale]/galleries/index.astro`         | list (non-default locales)                         |
| `src/pages/[locale]/galleries/[...slug].astro`     | detail (non-default locales)                       |
| `src/i18n/{types,lang/en,lang/ru,lang/tr}.ts`      | new keys, all supported locales                    |
| `src/content/galleries/{en,ru,tr}/sample-walk.mdx` | bundled sample for each locale                     |
| `src/content/galleries/_assets/*.{svg}`            | shared placeholder images                          |
| `src/__tests__/getGalleryPaths.test.ts`            | locale-aware path tests                            |
| `src/__tests__/galleriesByLocale.test.ts`          | locale filter tests                                |
| `package.json`                                     | `photoswipe@^5.4.4` dependency                     |

---

> **Originally written for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
