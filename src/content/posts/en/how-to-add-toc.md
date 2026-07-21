---
author: astro-paper-plus
pubDatetime: "2026-07-06T06:00:00.000Z"
title: "How to add a sticky right-rail table of contents"
tags:
  - docs
description: "Add an opt-in right-rail table of contents to long posts — sticky on desktop, collapsible on mobile, with scroll-spy and View Transitions support."
tocAside: true
---

AstroPaper+ ships with an opt-in **table of contents** for long-form posts. The component renders twice from one source: a collapsible `<details>` at the top of the article on mobile, and a sticky right-rail aside (`position: sticky`) on `lg+` viewports. An `IntersectionObserver`-based scroll-spy highlights the heading currently in view; the whole thing is View Transitions-friendly and degrades gracefully when JS is disabled.

## Enabling per post

The TOC is opt-in. Flip the flag in a post's frontmatter:

```md
---
title: "How to add a sticky right-rail table of contents"
pubDatetime: "2026-07-06T00:00:00Z"
description: "..."
tocAside: true # ← add this
---
```

That's it. The flag is added to the `posts` collection schema in `src/content.config.ts` and defaults to `false`, so existing posts render exactly as before unless the author explicitly opts in.

**Why opt-in?** Short posts look awkward with a one-item sidebar. The component additionally short-circuits to "no render" when a post has fewer than 2 h2/h3 entries — the flag is a hint, not a guarantee. You can see this in action: this very post enables `tocAside: true` and has 7 h2s, so the sidebar shows; a short post like `setting-dates-via-git-hooks.md` with 1 h2 wouldn't render the TOC even if the flag were on.

## How it renders

Below `lg` (1024px), the TOC is a collapsible `<details>` at the top of the article, above the title. Tap the summary to expand the heading list. The `<details>` element is fully accessible by default — no JS required, keyboard-toggleable, screen-reader friendly.

At `lg+`, the same data renders as a sticky right-rail aside:

- Width: `w-56` (224px) — wide enough for two lines of heading text per item on most fonts
- Position: `position: sticky; top: 5rem;` so it stays pinned to the top of the viewport as you scroll
- Max-height: `calc(100vh - 6rem)` with internal `overflow-y-auto` so very long heading lists scroll inside the rail instead of overflowing the viewport

When the flag is on, the post page also adjusts the surrounding layout: `<main>` widens from `max-w-3xl` (768px) to `max-w-[68rem]` (1088px) at `lg+`, and the article + rail sit in a 2-col CSS grid (`grid-cols-[1fr_minmax(0,_1fr)]`). The article's `min-w-0` prevents long code blocks from blowing out the grid; the rail takes its `w-56` and the rest goes to the article. Below `lg` the grid collapses to single column, the rail hides, and the mobile `<details>` takes over.

The active heading in the rail is highlighted with the accent colour, bold weight, and a left border (`border-s-2 border-accent`). The component also sets `aria-current="location"` on the active link for assistive tech.

## Scrollspy

The active state is driven by an `IntersectionObserver` watching every h2 and h3 inside the article. The `rootMargin` is `0px 0px -75% 0px`, which means a heading is "active" while it sits in the top quarter of the viewport — matches reader intuition: you've just scrolled past it, or you're reading it right now.

The observer is recreated on every `astro:page-load` and torn down on `astro:before-swap`, so the scrollspy survives Astro's view transitions without leaking observers across page swaps. The observer is a passive consumer — it never `preventDefault`s scroll, never moves the page, never fights with browser scroll restoration. Clicking a TOC link just navigates to the existing `#anchor` URL; the browser's native anchor scroll handles the rest.

If you'd rather not have any motion-driven highlighting, the `prefers-reduced-motion` media query in the component CSS strips the transition. The highlight itself is a class toggle, not an animation, so it still appears instantly.

## Customising the heading depth

The component filters the input to h2 and h3 only. h4+ headings are intentionally excluded — they make the rail noisy on posts that go deep. If you want to allow h4, edit the filter in `src/components/TableOfContents.astro` (the `isTocHeading()` predicate).

## Inline vs. sidebar

Both forms are available:

- The inline list (driven by `remark-toc` + the `## Table of contents` heading) renders automatically in any post that has it.
- `tocAside` (the sidebar) is opt-in per post. It activates on posts that set the flag.

You can use both at the same time (the inline list shows below the `## Table of contents` heading; the sidebar floats on the right), but it tends to feel redundant. The pattern this post uses — `tocAside: true` and no `## Table of contents` heading — is the cleanest for long-form posts. For shorter posts, the inline list is usually enough and you can skip the flag.

## Files added / changed

| Path                                       | Why                                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TableOfContents.astro`     | the component itself, with both mobile `<details>` and desktop sticky `<aside>`                                                                                                                    |
| `src/utils/toc.ts`                         | `nestToc` tree builder (extracted for testability)                                                                                                                                                 |
| `src/__tests__/toc.test.ts`                | 8 vitest cases for the tree builder                                                                                                                                                                |
| `src/remark-plugins.ts`                    | added `rehype-slug@6.0.0` to the shared `rehypePlugins` list — also fixes a pre-existing bug where the inline `#` link next to every heading was reading an empty `heading.id` and pointing at `#` |
| `src/content.config.ts`                    | added `tocAside: z.boolean().optional().default(false)` to the `posts` schema                                                                                                                      |
| `src/i18n/types.ts`                        | added `post.onThisPage`                                                                                                                                                                            |
| `src/i18n/lang/{en,ru,tr}.ts`              | translated `onThisPage` for all supported locales                                                                                                                                                  |
| `src/pages/posts/[...slug]/index.astro`    | reads `headings` from `await render(post)`, conditionally renders the TOC inside a 2-col grid, widens `<main>` to `max-w-[68rem]` on `lg+` when the flag is on                                     |
| `src/pages/[locale]/posts/[...slug].astro` | same wiring for non-default locales; also added the missing `useTranslations` import that the TOC label needs                                                                                      |
| `package.json`                             | `rehype-slug@^6.0.0` dependency                                                                                                                                                                    |

---

> **Originally written for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
