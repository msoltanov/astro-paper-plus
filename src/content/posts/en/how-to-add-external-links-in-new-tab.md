---
author: astro-paper-plus
pubDatetime: "2026-07-07T08:00:00.000Z"
title: "How to make external links open in a new tab"
tags:
  - docs
description: "Every off-site link in AstroPaper+ now opens in a new tab with the security-correct `rel` attributes and a screen-reader announcement. Authors don't write anything — the markdown / MDX body is rewritten automatically, with a `data-no-external` escape hatch for the rare case where you'd rather stay in-tab."
---

This post covers the new external-link treatment in AstroPaper+. Every off-site `<a>` in the markdown / MDX body now opens in a new tab with `target="_blank"` and `rel="noopener noreferrer"`, and a visually-hidden `(opens in new tab)` span is appended so screen-reader users get the same hint sighted users get from the new tab itself. Authors don't write any of it — the markdown pipeline rewrites the link for you.

## Table of contents

## What you get

| Link kind in your post       | Rewritten by the plugin? | Output                                                                          |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `https://example.com/post`   | yes — off-site           | `target="_blank" rel="noopener noreferrer"` + `(opens in new tab)` sr-only span |
| `https://yoursite.com/about` | no — same origin         | unchanged                                                                       |
| `/about`                     | no — root-relative       | unchanged                                                                       |
| `#section-2`                 | no — fragment            | unchanged                                                                       |
| `mailto:hi@example.com`      | no — non-http scheme     | unchanged                                                                       |
| `//other.com/post`           | yes — host differs       | same rewrite as off-site                                                        |
| `//yoursite.com/post`        | no — host matches        | unchanged                                                                       |

Two things are added that aren't in the table because they're invisible:

- The plugin always **adds** the `(opens in new tab)` span — it never replaces your link text. Screen readers still announce the link's original wording first, then the hint.
- The plugin never strips anything you wrote. If you already wrote `target="_blank"` (forgot the `rel`, say), the `rel` is added idempotently and your `target` is preserved.

## Why we do this automatically

A new-tab treatment for off-site links is the standard blog-UX expectation, and the `rel` attributes are a security requirement, not a stylistic choice.

### `rel="noopener"` — the security part

When `target="_blank"` is set without `rel="noopener"`, the newly-opened page can access `window.opener` and silently navigate the originating tab. That's the [reverse-tabnabbing vector](https://owasp.org/www-community/attacks/Reverse_Tabnabbing) — a malicious destination can read the originating page's URL, replace it with a phishing clone, etc. `noopener` cuts the link.

### `rel="noreferrer"` — the privacy part

Same attribute, second token: it suppresses the `Referer` request header, so the destination site doesn't see your URL in its analytics. Pure upside — no downside to including it on every external link.

### `target="_blank"` — the UX part

When a post cites another article, opening that citation in the same tab kicks the reader out of your content and forces them to use the Back button. New-tab is the standard fix; readers can compare sources without losing their place.

### The accessibility part — WCAG 2.1 SC 3.2.5

[WCAG 2.1 Success Criterion 3.2.5](https://www.w3.org/WAI/WCAG21/Understanding/change-on-request.html) recommends warning users when a link opens a new window. We satisfy that with a visually-hidden span:

```html
<a href="https://example.com/post" target="_blank" rel="noopener noreferrer">
  Example article<span class="sr-only"> (opens in new tab)</span>
</a>
```

Screen readers announce "Example article, (opens in new tab)". Sighted users see no change. The `.sr-only` utility is provided by Tailwind v4's default utility layer (`@import "tailwindcss"` in `src/styles/global.css`) — no CSS added by this plugin.

## Why a custom plugin (not `rehype-external-links` from npm)

`rehype-external-links` is the obvious pick from npm — battle-tested, configurable. We considered it and wrote our own instead. Three reasons:

- **No icon overlay by default.** The npm plugin's signature feature is the `↗` icon it appends to every external link. That's fine for a docs site, but a content-first blog (where most links are inline citations mid-paragraph) gets visually noisy fast. We don't want icons here.
- **No configurability tax.** The npm plugin supports per-domain opt-in/out, content callbacks, custom protocols. We have one rule: "off-site = new tab". A 120-line plugin that does exactly that is easier to reason about than a 600-line plugin where most of the API surface is unused.
- **No new runtime dependency.** `unist-util-visit` is already in our lockfile via `rehype-slug` / `rehype-callouts` / `rehypeLazyImages`. The plugin compiles to ~15 lines of new logic on top of that. The npm plugin adds 14kb of published code plus a peer-dep tree.

The win is small in absolute terms (one library we don't pull in) but it compounds across our `pnpm-workspace.yaml` `allowBuilds` list and the long tail of transitive deps that come with every published plugin.

## Author escape hatches

Two opt-out paths, in priority order:

### 1. `data-no-external="true"` — keep a specific link in-tab

```md
Read the [internal design doc](https://docs.example.com/our-design "Internal-only — keep me in this tab")
{ data-no-external="true" }
```

…or in raw HTML (`.mdx`):

```html
<a href="https://docs.example.com/our-design" data-no-external="true">
  Internal design doc
</a>
```

The plugin skips this link entirely — no `target`, no `rel`, no announcement. Useful when:

- A citation points to your own subdomain (e.g. `docs.example.com` when the blog is `blog.example.com`) and you'd rather keep the reader on the same tab.
- You want the back-button flow for a specific link (a "next article in the series" link, say).

### 2. Explicit non-`_blank` `target` — author choice wins

```html
<a href="https://example.com/post" target="my-iframe">open in iframe</a>
```

If you wrote `target` to anything other than `_blank` (or `_self` / `""`), the plugin respects your choice and does NOT add the new-tab treatment, because that link is not going to a new tab. Useful when you're integrating with an iframe target, a JS handler, or a custom preview pane.

## What we deliberately did NOT do

A few things that were tempting and that we left out on purpose:

- **An icon overlay (`↗`) on every external link.** Adds visual noise that doesn't pay for itself on a content-first blog. Authors who want the icon can drop a custom `<ExternalLink>` MDX component in their post; the plugin doesn't get in their way.
- **Always-on `aria-label="(opens in new tab)"` on the link itself.** That would replace the link text in the screen-reader announcement, hiding the actual destination from non-sighted users. The appended `sr-only` span is the WCAG-recommended pattern — it adds the hint without replacing the label.
- **A CSS-only `target="_blank"` polyfill via JS.** Browsers won't let CSS set `target`. The only way to do this consistently across markdown bodies is at the AST-rewrite layer.
- **Forcing the rewrite in `.astro` files.** The plugin runs on the rehype pipeline, which sees only the markdown / MDX body. External `<a>` tags in headers, footers, sidebars and component files are deliberately out of scope — they're already a hand-written, finite set, and you can add `target="_blank"` there with one attribute. If a single shared treatment across `.astro` and `.mdx` becomes worth it later, the move is a tiny `<ExternalLink>` Astro component, not expanding the plugin's scope.
- **Per-domain allow/deny lists.** "Open GitHub links in the same tab, but everything else in a new tab" is a configuration surface we'd have to maintain forever for almost no real-world use case. The escape hatch is enough.

## How to verify it works

Three ways to confirm the plugin is doing its job at build time:

1. **Inspect a built post's HTML.** Open `dist/posts/<slug>/index.html` and grep for `rel="noopener noreferrer"`. You should see exactly one match per off-site link in the post body, plus the matching `<span class="sr-only"> (opens in new tab)</span>` inside each.
2. **Click an off-site link in a built page.** It should open in a new tab. Right-click → "open in new tab" should still work (no JS handler hijacking it).
3. **Run the test suite.** `pnpm vitest run src/__tests__/rehypeExternalLinks.test.ts` covers 20 cases: the happy path, every internal-link passthrough rule, both escape hatches, the `sr-only` idempotence contract, malformed-URL fail-closed behaviour, and preservation of every author-provided attribute.

## What this plugin does NOT touch

To set expectations clearly, here's the explicit scope:

- **Markdown / MDX bodies only.** Links inside frontmatter, headings, list items, blockquotes, table cells — yes, all of those, because they're all part of the rendered post body. Links in code fences — no, the parser drops them before the rehype stage runs, which is correct.
- **NOT `.astro` files.** Header, footer, sidebar, post cards, search results, any `.astro` component — these render in the framework layer, not through the unified pipeline, and the plugin never sees them. Add `target="_blank"` to those links explicitly, or use a small `<ExternalLink>` Astro component if you want one shared treatment.
- **NOT RSS or sitemap XML.** Those emit raw `<link>` / `<loc>` elements, not `<a>` tags in user-visible HTML. The plugin's HAST visitor never walks them.
- **NOT raw email / phone / JavaScript URIs.** `mailto:`, `tel:`, `sms:`, `data:`, `javascript:` — none of these open a new tab, so the new-tab treatment would be wrong. They're explicitly skipped.

## What an off-site link actually looks like after the rewrite

Take this Markdown:

```md
AstroPaper is a fork of [AstroPaper](https://github.com/satnaing/astro-paper) by Sat Naing.
```

It renders as:

```html
<p>
  AstroPaper is a fork of
  <a
    href="https://github.com/satnaing/astro-paper"
    target="_blank"
    rel="noopener noreferrer"
  >
    AstroPaper<span class="sr-only"> (opens in new tab)</span>
  </a>
  by Sat Naing.
</p>
```

— security-correct, accessibility-correct, zero author effort. That's the entire feature.
