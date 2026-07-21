---
author: astro-paper-plus
pubDatetime: "2026-07-07T06:00:00.000Z"
title: "How to add captions under Markdown images"
tags:
  - docs
description: "Use the standard Markdown `title` attribute to get a real `<figcaption>` underneath body images — with opt-out escape hatches and full a11y independence between alt text and visible caption."
---

This post covers the new figure-caption support in AstroPaper+. Authors can now drop a caption under any body image using the standard Markdown image-with-title syntax — no MDX, no hand-rolled HTML, no second pass through an image component. The plugin only kicks in when you actually write a title, so nothing changes for posts that don't need captions.

## Table of contents

## Quick example

```md
![A reader bookmarks a paperback in a worn copy of "Solaris"](/uploads/bookmark.jpg "Figure 3 — bookmarks are the original reader annotations")
```

renders as:

```html
<figure>
  <img
    src="/uploads/bookmark.jpg"
    alt="A reader bookmarks a paperback in a worn copy of 'Solaris'"
    loading="lazy"
    decoding="async"
  />
  <figcaption>
    Figure 3 — bookmarks are the original reader annotations
  </figcaption>
</figure>
```

— a real `<figure>` with a real, visible, screen-reader-friendly caption underneath. The image keeps all the LCP / `loading="lazy"` defaults from `rehypeLazyImages`; you can see the wiring in the existing post on automatic loading hints.

## Why "title → figcaption" and not "alt → figcaption"

The single most important design choice here is _what_ gets promoted into the figcaption. We picked the Markdown `title` attribute over the `alt` attribute on purpose.

Alt text and captions serve different audiences:

- **`alt` is read by screen readers.** The [W3C alt-text decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/) asks you to keep it concise and content-describing, or empty if the image is purely decorative. Read it aloud to yourself — that's how it has to feel.
- **`<figcaption>` is read by sighted users on the page.** It can be longer, contextual, even repeat nearby prose ("Figure 3 — revenue per quarter, Q1 2023 onward").

Coupling the two means every author has to make a bad choice: write a long-form alt sentence to get a usable caption (a11y footgun), or write a short, correct alt and end up with a caption that just says "bar chart" (useless to readers). Tying captions to the standard Markdown `title` keeps the two concerns independent and makes the feature opt-in by construction. No `title`, no figcaption — the 99% case for posts that don't need a caption works exactly like before.

## Author escape hatches

Four opt-out paths, in priority order:

### 1. `data-no-caption="true"` — leave the image alone

```html
<img
  src="/inline-icon.png"
  alt="decorative icon"
  title="hover tooltip"
  data-no-caption="true"
/>
```

The plugin won't wrap this image at all. The `title` survives on the `<img>` as a hover tooltip — exactly what an author who wrote `title="…"` typically wants.

### 2. `class="…no-caption…"` — opt out via a class token

```html
<img
  src="/inline-icon.png"
  alt="decorative icon"
  title="hover tooltip"
  class="no-caption"
/>
```

Same effect, attribute form vs. utility-class form. Pick whichever fits your typing style.

### 3. You already wrote a `<figure>`

Authors who hand-roll their figure in `.mdx` (`<figure><img src="…" alt="…" title="…"><figcaption>Hand-written caption</figcaption></figure>`) get an explicit pass-through — the plugin refuses to nest figures or duplicate the caption. Your hand-rolled caption always wins.

### 4. The image is inside an `<a>`

The Markdown image-as-link pattern `[![alt](src)](href)` produces an `<img>` whose parent is an `<a>`. Since `<a>` cannot legally contain `<figure>` (HTML5 content-model rule), the plugin skips those and leaves the title as a tooltip on the linkable thumbnail. Correct behaviour for the common "clickable preview" use case.

## What you get out of the box

| Image has `title`?               | Result                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Yes (non-empty)                  | wrapped in `<figure>` with a `<figcaption>{title}</figcaption>` child; `title` attribute is stripped from the `<img>` to avoid double-rendering |
| Empty / whitespace-only          | untouched — no wrap, no figcaption, attribute left as the author wrote it                                                                       |
| Image inside existing `<figure>` | skipped (author wins)                                                                                                                           |
| Image inside `<a>`               | skipped (HTML5 forbids `<a>` containing `<figure>`)                                                                                             |
| Has `data-no-caption="true"`     | skipped (hard opt-out)                                                                                                                          |
| Has `no-caption` class token     | skipped (utility-class opt-out)                                                                                                                 |

All other attributes on the wrapped `<img>` are preserved — `loading`, `decoding`, `fetchpriority`, `width`, `height`, `srcset`, `class`, etc. The plugin only adds the `<figure>` wrap and the `<figcaption>` child, and only removes the title attribute that now lives in the figcaption.

## How it looks visually

A new body image with a caption renders inside the article flow with the project's existing typography in charge of the styling — there's no new CSS to write.

Concretely, what authors and readers see:

- The `<figure>` carries Tailwind Typography's default margins (`margin: 2em 0`), so it sits cleanly between prose paragraphs.
- The inner `<img>` keeps its existing `border-border` border and `mx-auto` centering.
- The `<figcaption>` is rendered at `text-foreground` color from the post-prose typography block, at `opacity-75` (the project's "this is metadata, not body content" tone), font-size 0.875em, centered, `max-w-prose` (~65ch), with a small breath of vertical space between image and text.
- It is **stylistically distinct** from the embed-card figcaption (`figure[data-embed] figcaption`) used for YouTube/Vimeo/SoundCloud/Spotify embeds — those get a tinted background and padding-3 strip, while ours stays inline under the image.

If you want to tune the look — say, left-aligned captions under inline diagrams instead of centered ones — add a single selector to `src/styles/typography.css`:

```css
.app-prose figure:not([data-embed]) figcaption {
  @apply text-left;
}
```

The `:not([data-embed])` selector is the guard rail — it scopes your rule to images-with-captions only and leaves the embed cards alone.

## Verifying it works

Two quick ways to confirm at build time:

1. **Inspect a built post's HTML.** Find a post that uses the `![alt](src "title")` syntax and open `dist/posts/<slug>/index.html` (or its per-locale sibling). Grep for `<figcaption>` — every titled image should have one, with the literal title text inside. The corresponding `<img>` should have no `title=` attribute (only `src`, `alt`, `loading`, `decoding`, `fetchpriority`).
2. **Add a temporary titled image** at the bottom of a draft post and `pnpm build` — the new HTML line will show the wrap immediately. The smoke test in this post's source uses the `portfolio-website-development` example post, which already exercises the feature with both EN and RU titles and confirms the pipeline end-to-end.

## Why a custom plugin (not an npm package)

We considered the obvious candidates and rejected them:

- **`rehype-figure`** (the package with the same name as the feature). It defaults to deriving `<figcaption>` from `alt`, exactly the design choice we wanted to _avoid_ — that bakes the a11y footgun in. It also lacks a clean opt-out for "I want the title as a tooltip, not a caption", and it doesn't preserve explicit hand-rolled `<figure>` wrappers reliably across MDX. Patching its options grows past the size of just writing our own.
- **`rehype-attr` + a hand-written walker** — does the AST walk, but you'd still need the title-stripping, the figure-already-exists guard, the link-parent guard, and the opt-out lookup yourself. At that point, the middleman isn't doing anything.
- **An MDX-only `<Figure>` component**. Most posts in this blog are `.md`, not `.mdx`. If we only shipped a component, every markdown author would have to migrate to MDX or hand-roll `<figure>` HTML.

Net: a ~150-line plugin is a one-time cost that fits the existing rehype pipeline (right next to `rehypeLazyImages` and `rehypeCallouts`), uses zero new dependencies, and reads standard Markdown syntax that authors already know.

## What we deliberately did NOT do

- **Generate figcaptions from alt.** Re-stating the central design decision, because it's the kind of thing that gets "improved" later by someone who doesn't see the trade-off: alt ≠ caption, ever, in this feature.
- **A `data-caption="…"` attribute for inline captions.** Adds a new authoring surface to discover, document, and remember — when the standard Markdown `title` syntax already exists and was sitting unused.
- **Strip whitespace-only titles from the `<img>`.** When the author writes `title="   "` they probably meant something; if a browser tooltip from a whitespace-only title is annoying, that's an authoring accident on their side, not ours to silently fix. The plugin's contract is "no title content → no wrap, leave the rest alone".
- **Wrap an `<img>` inside an `<a>`.** `<a>` cannot legally contain `<figure>` in HTML5. If you need a captioned linkable image, use the hand-rolled `<figure>` path or move the link inside the `<figure>` (`<figure><a href="…"><img …></a><figcaption>…</figcaption></figure>`).
- **Touch non-`<img>` elements.** `<svg>` titles, `<a>` titles, `<abbr>` titles — all left alone. The plugin explicitly checks `node.tagName !== "img"` and returns.

## Files added / changed

| Path                                        | Why                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/utils/rehypeFigureCaption.ts`          | the plugin itself — walks HAST, wraps titled `<img>` in `<figure><figcaption>{title}</figcaption></figure>`, honours every escape hatch in the table above                                                                                                                     |
| `src/__tests__/rehypeFigureCaption.test.ts` | 14 vitest cases covering the markdown path, the raw-HTML path (`.mdx` authors), every escape hatch, the link-in-`<a>` rule, HTML escaping in figcaptions, and the `{ enabled: false }` config switch                                                                           |
| `src/remark-plugins.ts`                     | added `rehypeFigureCaption` to the shared `rehypePlugins` list, before `rehypeLazyImages` so the lazy plugin still sees the inner `<img>` regardless of the wrap                                                                                                               |
| `src/styles/typography.css`                 | **no changes** — the existing `.app-prose figcaption { opacity-75 }` plus Tailwind Typography's prose defaults already produce the right caption look; `figure[data-embed]` keeps its card style because the `:not([data-embed])` guard scopes that rule to embed figures only |

---

> No new dependencies were added. The plugin reuses `unist-util-visit` (already a transitive of every unified pipeline) and the hast types from `@types/hast` (already a devDep for other rehype work). The whole change is a self-contained rehype plugin plus its test suite — about 290 lines added in total, zero new prod-deps.
