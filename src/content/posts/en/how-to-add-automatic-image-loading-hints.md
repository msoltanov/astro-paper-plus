---
author: astro-paper-plus
pubDatetime: "2026-07-06T06:00:00.000Z"
title: How to add automatic loading hints and LCP-safe image defaults
tags:
  - docs
description: "Every body image in AstroPaper+ now ships with `loading='lazy'` + `decoding='async'` by default, with a first-image LCP escape hatch and a gallery-card `priorityFirst` prop for JSX-side coverage."
---

This post covers the new automatic image performance defaults in AstroPaper+: every `<img>` rendered through the markdown / MDX pipeline gets `loading="lazy"` and `decoding="async"` by default, with a one-line LCP escape hatch for the first image of each post and a matching opt-in for the JSX-side gallery pages.

Nothing changes for authors in the common case — drop `![alt](src)` into a post and it Just Works™. The interesting knobs are for the edge cases (a hero illustration that should always load early, a non-gallery JSX page where the first card is the LCP element, etc.).

## Table of contents

## What you get out of the box

A new rehype plugin (`src/utils/rehypeLazyImages.ts`) walks every `<img>` in the rendered post body and sets:

| Image position                            | `loading` | `decoding`                                   | `fetchpriority`     |
| ----------------------------------------- | --------- | -------------------------------------------- | ------------------- |
| First `<img>` in the post (LCP candidate) | `eager`   | _(browser default — sync for fastest paint)_ | `high`              |
| Every other `<img>`                       | `lazy`    | `async`                                      | _(unset — default)_ |

That's the entire default policy. The first image is the LCP candidate on a typical post page, so we want it fetched early with high priority and decoded synchronously; everything else defers.

The plugin runs on the HAST (HTML AST) tree, so it also catches raw `<img>` HTML that authors write directly in `.mdx` — not just markdown's `![]()` syntax.

## Why we don't just slap `loading="lazy"` on every image

Naively lazy-loading the first image of a post is the classic "I made my LCP worse" mistake. The first image is almost always the largest contentful paint element on a post page; if you tell the browser to wait until the user scrolls near it before fetching, you've added a network round-trip to the critical render path.

The escape hatch is one attribute pair: `loading="eager"` + `fetchpriority="high"`. We attach both to the first image automatically; you can override the rule with the data attributes below if the heuristic guesses wrong (e.g. your post opens with a small badge before the actual hero).

## Author escape hatches

Three opt-out paths, in priority order:

### 1. `data-no-lazy="true"` — leave the image alone

```html
<img src="/banner.png" alt="…" data-no-lazy="true" />
```

The plugin will not touch `loading` / `decoding` / `fetchpriority` on this image. Useful when you've already hand-tuned the attributes in `.mdx` and don't want the plugin to clobber them.

### 2. `class="…no-lazy…"` — opt out via a class token

```html
<img src="/footer-spacer.png" alt="…" class="no-lazy" />
```

Same effect as `data-no-lazy`, more familiar to anyone used to utility-class conventions.

### 3. Explicit `loading="…"` — respect what the author wrote

```html
<img src="/hero.png" alt="…" loading="eager" />
```

The plugin respects an explicit `loading` attribute and only adds `decoding="async"` (which is universally safe and rarely overridden).

### Opt in: `data-lcp="true"` — force the LCP treatment on any image

```html
<!-- Second image is the real hero, not the first one -->
<img src="/small-badge.png" alt="" />
<img src="/hero.png" alt="…" data-lcp="true" />
```

The image gets `loading="eager"` + `fetchpriority="high"` regardless of its position in the document. Useful when a post opens with a small icon or logo before the actual hero illustration.

## Gallery LCP coverage (JSX-side)

The rehype plugin only sees images that go through the markdown pipeline. The gallery pages (`/galleries/`, `/galleries/<slug>`) render in `.astro` and don't — they need their own treatment.

### `GalleryCard.astro` — new `priorityFirst` prop

```astro
---
import GalleryCard from "@/components/GalleryCard.astro";

const galleries = await getCollection("galleries");
---

<GalleryCard locale="en" galleries={galleries} priorityFirst={true} />
```

When `priorityFirst={true}` is passed, the first card's cover image is marked as the LCP candidate: `loading="eager"` + `fetchpriority="high"`. All other cards stay `loading="lazy"`. The default is `false`, so the component is still safe to drop into a sidebar or footer without re-introducing layout shift.

Both `/galleries/` listing pages (en + per-locale under `src/pages/[locale]/galleries/`) pass `priorityFirst={true}` because the first card is the most likely LCP element on those pages.

### Gallery detail pages — first thumbnail eager+high

Same rule, applied inline: the first `<img>` in `/galleries/<slug>`'s thumbnail grid gets `loading="eager"` + `fetchpriority="high"`. The rest are lazy. No prop changes needed at the call site — it's wired in `src/pages/galleries/[...slug].astro` and its per-locale sibling.

## Verifying it works

Two ways to confirm the plugin is doing its job at build time:

1. **Inspect a built post's HTML** — open `dist/posts/<slug>/index.html` and grep for `loading=`. The first `<img>` should carry `loading="eager" fetchpriority="high"`; the rest should be `loading="lazy" decoding="async"`.
2. **Run Lighthouse** on a real post page and confirm LCP is unchanged (or improved) versus the pre-plugin baseline. Total transfer for the page should drop — every below-the-fold image now waits until scroll proximity.

## Why a custom plugin (not an npm package)

A few alternatives we considered and rejected:

- **`rehype-rewrite`** — does the AST walk, but you'd still need to write the LCP-escape / data-attr / class-lookup logic yourself. At that point the middleman isn't doing anything.
- **`rehype-img-aspect-ratio`** + a generic loading-attr plugin — same story: the LCP rule is the part that matters, and it has to be hand-written.
- **Astro's `<Image>` component** — already does responsive srcsets, but only for images you explicitly import in `.astro` / `.mdx`. Markdown `![]()` doesn't go through it without an extra `<Image src={…}>` wrapper per image, which defeats the "just write markdown" ergonomics.

Net: a 180-line plugin is a one-time cost that pays back in every post. No new runtime dependency, no author-visible API change, no churn on the existing 80+ posts.

## What we deliberately did NOT do

- **`fetchpriority="auto"` on lazy images** — that's the browser default. Setting it explicitly is just bytes in the HTML.
- **`decoding="async"` on the LCP image** — counter-intuitively, the LCP image should decode synchronously for fastest paint. Async decode would add a microtask delay before the image appears. Browsers pick sync decode automatically when `loading="eager"`, so we leave `decoding` unset on the LCP image.
- **Astro `<Image>` migration for body images** — tempting, but `<Image>` requires importing the asset in MDX and breaks the "write markdown" promise. The plugin approach keeps the authoring ergonomics intact while still getting 90% of the wins.
- **A blanket `loading="lazy"` on the first image with a `<link rel="preload">` workaround** — works, but adds a network round-trip the LCP image already has. A single attribute pair is simpler and faster.

## Files added / changed

| Path                                           | Why                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/rehypeLazyImages.ts`                | the plugin itself — sets `loading` / `decoding` / `fetchpriority` per the table above; honours every author escape hatch                                                        |
| `src/__tests__/rehypeLazyImages.test.ts`       | 12 vitest cases covering happy path + every escape hatch + raw `<img>` HTML in `.mdx` + the `protectFirstImage: false` config switch                                            |
| `src/remark-plugins.ts`                        | added `rehypeLazyImages` to the shared `rehypePlugins` list, last in the chain so it sees every `<img>` regardless of which earlier plugin (e.g. `rehype-callouts`) produced it |
| `src/components/GalleryCard.astro`             | new `priorityFirst` prop; first card's cover image gets `loading="eager"` + `fetchpriority="high"` when the prop is true                                                        |
| `src/pages/galleries/index.astro`              | passes `priorityFirst={true}` on the listing page                                                                                                                               |
| `src/pages/[locale]/galleries/index.astro`     | same wiring for the per-locale listing                                                                                                                                          |
| `src/pages/galleries/[...slug].astro`          | first thumbnail in the gallery grid gets `loading="eager"` + `fetchpriority="high"`                                                                                             |
| `src/pages/[locale]/galleries/[...slug].astro` | same wiring for the per-locale gallery detail page                                                                                                                              |
| `CHANGELOG.md`                                 | `## v7.0.0` → `### Feat` entry for both bullet points                                                                                                                           |

---

> No new dependencies were added. The plugin reuses `unist-util-visit` (already a transitive of every unified pipeline) and `rehype-stringify`'s `Properties` type from `@types/hast` (already a devDep for other rehype work). The whole change is a self-contained 180-line plugin plus six small call-site updates.
