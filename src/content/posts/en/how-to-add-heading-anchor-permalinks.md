---
author: astro-paper-plus
pubDatetime: "2026-07-08T08:00:00.000Z"
title: "How to add permalink anchors to headings"
tags:
  - docs
description: "Every h2..h6 in your post gets a real `#` permalink in the rendered HTML — emitted at build time, no JS, JS-independent readers and all supported locales included. With opt-out escape hatches for the rare cases where the visual affordance is wrong."
---

This post covers the new heading-anchor support in AstroPaper+. Every `<h2>` through `<h6>` in your post body now ships with a stable `#` permalink next to it, baked into the rendered HTML at build time — no JS, no runtime DOM injection, no FOUC, and the same behaviour across every locale (`/en`, `/ru`, `/tr/`).

## Table of contents

## Quick example

```md
## Build-time heading anchors
```

renders as:

```html
<h2 id="build-time-heading-anchors" class="group">
  Build-time heading anchors
  <a
    class="heading-link ms-2 no-underline opacity-75 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
    aria-label="Permalink to this heading"
    href="#build-time-heading-anchors"
  >
    <span aria-hidden="true">#</span>
  </a>
</h2>
```

The `#` glyph is hidden inside an `aria-hidden` `<span>` so screen readers don't have to announce "hash" — they read the anchor's `aria-label` ("Permalink to this heading") instead. On mobile the link is visible at `opacity-75`; on `md+` it fades in on hover or when the heading receives keyboard focus. The `group` class on the heading itself is what makes Tailwind's `group-hover:` variant resolve.

## Why build-time, not runtime

Before this plugin, the `#` next to every heading was injected by an inline `addHeadingLinks()` script in `src/pages/posts/[...slug]/index.astro`. That worked but produced three concrete problems:

1. **Flash of unstyled content.** On first paint the heading appeared alone, then the script ran, then the `#` faded in. Visible jank on slow connections.
2. **JS required.** RSS-feed readers, reader-mode tools, and visitors with JavaScript off saw plain headings — no permalink affordance at all.
3. **Copy link was broken pre-hydration.** Before the script attached the anchor, the `#` was a `<span>` — you couldn't right-click → "Copy link" until the script had run.

There was also a latent issue that nobody had noticed: the script only lived in the **default-locale** post route (`src/pages/posts/[...slug]/index.astro`). The per-locale route at `src/pages/[locale]/posts/[...slug].astro` didn't carry it, so `/ru/` and `/tr/` post pages were silently missing the `#` anchor on every heading. Build-time emission closes every supported locale at once.

## How the anchor markup gets there

A new `rehypeHeadingAnchors` plugin (`src/utils/rehypeHeadingAnchors.ts`) lives in the shared `rehypePlugins` list at `src/remark-plugins.ts`, registered **after** `rehypeLazyImages` and **before** `rehypeExternalLinks`. That ordering means:

- `rehype-slug` (already registered, runs first) has already attached a stable `id` to every heading by the time this plugin walks the tree.
- `rehype-callouts`, `rehype-figure-caption`, `rehype-lazy-images` have all finished their AST mutations, so we see every heading regardless of which earlier plugin produced it.
- `rehype-external-links` still has the literal-last slot it had before — its "see every `<a>` regardless of who produced it" contract is preserved.

The plugin only operates on `h2`–`h6` by default. `h1` is excluded because every page in this theme renders its post title as an `<h1>` above the article body (so anchoring it would put a `#` next to the page title). To override the selector, pass `{ include: ["h1","h2","h3","h4","h5","h6"] }` to the plugin in `src/remark-plugins.ts`.

## Safe-fallback when `id` is missing

The plugin depends on `rehype-slug`'s `id` attribute. That plugin runs unconditionally and should always produce one, but a malformed `<h2 id="">` on `.mdx` could in principle confuse the slugger. As defence in depth, `rehypeHeadingAnchors` derives a fallback slug from the heading's plain text via `src/utils/slugify.ts` and writes it back to the heading's `id` so the produced `<a href="#…">` still resolves to a real DOM node instead of pointing at the empty fragment. An empty heading falls back to the literal `_` (matches the convention used by `rehype-slug` for non-text nodes).

## Author escape hatches

Four opt-out paths, in priority order:

### 1. `data-no-heading-anchors="true"` — leave the heading alone

```html
<h2 data-no-heading-anchors="true">Hero heading, no permalink please</h2>
```

The plugin won't touch this heading at all — no `group` class is added, no anchor is appended. Use this on hero-style headings where the `#` would be visually wrong, or on a single inline `<h2>` inside a complex layout.

### 2. `class="…no-heading-anchors…"` — opt out via a class token

```html
<h2 class="no-heading-anchors">Same effect, different syntax</h2>
```

Same effect, attribute form vs. utility-class form. Pick whichever fits your typing style.

### 3. The heading is inside an `<a>` or `<button>`

HTML5 forbids `<a>` from containing `<a>`, and `<button>` containing `<a>` is also invalid (screen readers announce it as gibberish). A heading nested in either is skipped silently.

### 4. Idempotency — you (or another plugin) already added an anchor

If a heading already carries an `<a class="heading-link …">` child from a previous pass, the plugin recognises it and skips. This means the plugin can run twice without stacking two anchors — useful if some future refactor accidentally double-registers it.

## What you get out of the box

| Heading matches                       | Result                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `h2`..`h6` in `.md` / `.mdx`          | gets a trailing anchor child; heading gets `group` class; `<a>` href points at the `id` produced by `rehype-slug` |
| `h1`                                  | skipped (page title slot)                                                                                         |
| `h2`..`h6` inside `<a>` / `<button>`  | skipped (HTML5 forbids anchor-nesting)                                                                            |
| Has `data-no-heading-anchors="true"`  | skipped (hard opt-out)                                                                                            |
| Has `no-heading-anchors` class token  | skipped (utility-class opt-out)                                                                                   |
| Already has an `a.heading-link` child | skipped (idempotency)                                                                                             |

All other attributes on the heading are preserved — `class`, `id`, view-transition styles, nested inline content, etc. The plugin adds a `group` class to the heading (idempotently — no double-`group`) and appends one anchor element to its children. Nothing else changes.

## Why a custom plugin (not an npm package)

We considered the obvious candidate and rejected it:

- **`rehype-autolink-headings`** (the package with the obvious name). Its defaults are heavier than we want — it pulls in `github-slugger` as a peer, default behaviour wraps the heading text in the `<a>` (which would steal clicks from the heading itself), and the only built-in opt-out is at the heading level rather than the per-heading attribute form. Patching its options grows past the size of just writing our own. The actual plugin logic is ~270 lines and uses `unist-util-visit`, already in the lockfile as a transitive of every unified pipeline we depend on.

Net: a self-contained ~270-line plugin fits the existing rehype pipeline (right next to `rehypeLazyImages` and `rehypeCallouts`), uses zero new dependencies, and emits markup that matches the prior runtime output exactly so existing CSS targeting `.heading-link` continues to apply unchanged.

## What we deliberately did NOT do

- **Wrap the heading text in the `<a>`.** Re-stating the central design decision, because it's the kind of thing that gets "improved" later by someone who doesn't see the trade-off: a wrapping `<a>` re-flows layout on hover, steals clicks from the heading text, and changes how users select-and-copy the heading. We append a small `<a>` after the heading content instead.
- **Insert the anchor before the heading text.** Same reasoning — moves the heading's first-paint position, breaks the existing prose typography that assumes heading content starts immediately, and re-flows layout on the iPad/desktop when the hover-reveal kicks in.
- **Make the `#` always visible on every viewport.** On mobile the link is `opacity-75`, on `md+` it fades to `md:opacity-0` and reveals on hover/focus. The "always visible at full opacity" treatment makes body headings look noisy on a phone; the hover-reveal is what GitHub and MDN do, and it's the right default for a blog theme.
- **Operate on `<h1>`.** Page-title slot. Adding a `#` next to the post title is the kind of thing that gets turned on by accident and never turned off. Excluded by default, configurable for cases where it actually matters.
- **Run on the footer / sidebar / layout headings.** The plugin only sees markdown / MDX bodies (matching the boundary `rehypeExternalLinks` and `rehypeFigureCaption` use). Layout headings live in `.astro` files and aren't touched — they don't pass through the rehype pipeline.

## Verifying it works

Two quick ways to confirm at build time:

1. **Inspect a built post's HTML.** Open `dist/posts/<slug>/index.html` (or its per-locale sibling) in your editor. Grep for `<a class="heading-link ms-2 no-underline`. Every h2..h6 should have one — no exceptions except opt-outs. The `href` should equal `#` + the heading's `id`, and the `id` should match what you'd type if you wanted to deep-link to that section.
2. **Build and click.** Run `pnpm build` and a local `pnpm preview`. Open any post, hover a heading — the `#` fades in, click it, URL gets a `#…` fragment, copy-link from the browser's address bar returns the full deep-link URL.

## Files added / changed

| Path                                         | Why                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/rehypeHeadingAnchors.ts`          | the plugin itself — walks HAST, appends one `<a>` per h2..h6 (configurable), adds `group` to the heading, consumes `rehype-slug`'s `id`, derives a fallback slug if the `id` is somehow missing                                                                                                                                                |
| `src/__tests__/rehypeHeadingAnchors.test.ts` | 20 vitest cases covering the markdown path, the raw-HTML path (`.mdx` authors), every escape hatch, idempotency, missing-`id` fallback, custom `anchorClassName` / `ariaLabel` / `include` options, the `{ enabled: false }` config switch, and a multi-heading round-trip with a duplicate heading text (rehype-slug disambiguates with `-1`) |
| `src/remark-plugins.ts`                      | added `rehypeHeadingAnchors` to the shared `rehypePlugins` list, between `rehypeLazyImages` and `rehypeExternalLinks` so it sees every heading produced upstream and `rehypeExternalLinks` keeps the literal-last slot                                                                                                                         |
| `src/pages/posts/[...slug]/index.astro`      | removed the inline `addHeadingLinks()` runtime script (lines 238–254) and its call site; the build-time plugin now handles h2..h6 anchors for every locale, not just the default-locale route                                                                                                                                                  |

---

> Russian mirror: [`src/content/posts/ru/how-to-add-heading-anchor-permalinks.md`](/ru/posts/how-to-add-heading-anchor-permalinks/). No new dependencies were added. The plugin reuses `unist-util-visit` (already a transitive of every unified pipeline) and the hast types from `@types/hast`. The whole change is a self-contained rehype plugin plus its test suite plus one script deletion — about 290 lines added, 20 lines removed, zero new prod-deps.
