---
author: astro-paper-plus
pubDatetime: "2026-07-07T12:30:00.000Z"
title: "How to auto-generate post excerpts"
tags:
  - docs
---

AstroPaper+ can derive a post's `description` from the content itself — drop a `<!-- more -->`
marker in the body and everything above it becomes the excerpt. Frontmatter `description:`
still wins when present, so existing posts are unaffected.

**This very post demonstrates the feature**: it has no frontmatter `description:` field, but the
paragraphs above this line are auto-extracted and reused as the Card excerpt on listings, the
`<meta name="description">` and `<meta property="og:description">` tags on this page, and the
`<description>` element in `dist/rss.xml`.

## Table of contents

## The marker

Wherever you want the excerpt to break, add a single line on its own:

```md
Lead paragraph that becomes the excerpt.

More lead content, still part of the excerpt.

<!-- more -->

The rest of the post, which is _not_ part of the excerpt.
```

The marker is the same convention Jekyll, Hugo, and Eleventy use, so muscle memory carries over
if you've written for any of those.

### Marker variants

All three are recognised — case and whitespace inside the comment are normalised:

- `<!-- more -->`
- `<!--more-->`
- `<!-- MORE -->`

Only the **first** marker counts. Later markers stay in the body unchanged.

## Precedence

| source                                 | what happens                                                       |
| -------------------------------------- | ------------------------------------------------------------------ |
| frontmatter `description:` (non-empty) | wins — body excerpt is not even attempted                          |
| `<!-- more -->` body excerpt           | wins when frontmatter is missing or blank                          |
| whitespace-only frontmatter (`"   "`)  | treated as missing — body excerpt takes over                       |
| neither frontmatter nor marker         | Card renders no `<p>`; RSS falls back to `config.site.description` |

## What gets stripped

After the marker splits the body, markdown is stripped to plain text so the result is safe to
feed straight into `<meta>` / OG / RSS — none of those contexts render markdown literally for
you.

- ATX headings (`## Why this matters`) → drop the `#` prefix, keep the text
- `[label](url)` links → keep the label, drop the URL
- `![alt](url)` images → keep the alt
- `**bold**` / `*italic*` / `~~strike~~` / `==mark==` → keep the text
- `` `inline code` `` → keep the code
- list markers (`-` / `*` / `+` / `1.`) and blockquote `>` prefixes → dropped
- fenced code blocks → entire fenced region skipped (code shouldn't leak into a meta description)
- raw HTML tags (`<aside>`, `<figure>` etc.) → entire line skipped
- YAML `---` dividers → skipped

A `<!-- more -->` marker written _inside_ a fenced code block is ignored — the marker has to
actually live in rendered prose. Identical-character fences close (CommonMark rule 4.5 — a
fenced block using backticks only closes another backtick fence, not a tilde fence). An unclosed
fence consumes the rest of the body, so the marker stays unreachable.

## Where the excerpt shows up

The fallback path is wired into every consumer that previously read `data.description` directly:

- the Card listing's `<p>{…}</p>` on `/posts/`, `/<locale>/posts/`, and the home page
  recent-posts section
- the post page `<meta name="description">` and `<meta property="og:description">`
- the `<description>` element per item in `dist/rss.xml` and the per-locale feeds

Existing posts (all of them right now) ship with frontmatter `description:` so behaviour is
unchanged for any published post. The fallback only kicks in for new posts whose author chose
not to write a separate description.

## i18n

The auto-excerpt path is locale-agnostic — the helper reads raw markdown source, opaque to
language. All supported locales (`en` / `ru` / `tr`) get the same behaviour.
Per-locale RSS feeds use the corresponding locale's post body.

## Authoring tips

- **Keep the excerpt short.** Google truncates meta descriptions around 155–160 characters; the
  stripper does not cap length, so the upper bound is on you. Two or three paragraphs is the
  sweet spot for SEO and listing cards.
- **First paragraph matters most.** Cards on the home page and `/posts/` use this as the lead
  text. Lead with the thesis, not background.
- **Don't bury the marker in a code block.** If your first paragraphs need a fenced example,
  put the marker _after_ the code block, not inside it.
- **Self-demonstration is encouraged.** The pattern this post itself uses — no frontmatter
  `description:`, a `<!-- more -->` after the intro, and the rest below — works well. The
  Card on listings and the meta tags you can `view-source` right now are the auto-extracted
  excerpt.

## Files added / changed

| Path                                                  | Why                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/content.config.ts`                               | `description: z.string().optional()` (was required)                     |
| `src/utils/postDescription.ts`                        | `extractExcerpt(body)` (pure) + `postDescription(post)` (wrapper)       |
| `src/__tests__/postDescription.test.ts`               | 25 vitest cases                                                         |
| `src/components/Card.astro`                           | uses `postDescription(post)`, guards with `&&` to avoid empty `<p></p>` |
| `src/pages/posts/[...slug]/index.astro`               | passes `postDescription(post)` to `<PostLayout>` as `description`       |
| `src/pages/[locale]/posts/[...slug].astro`            | same wiring for non-default locales                                     |
| `src/pages/rss.xml.ts`                                | `description: postDescription(post) ?? config.site.description`         |
| `src/pages/[locale]/rss.xml.ts`                       | same wiring for non-default locale feeds                                |
| `src/content/posts/{en,ru,tr}/adding-new-post.md{x,}` | docs updated to reflect the new optional contract                       |
| `CHANGELOG.md`                                        | `## v7.0.0` section: Feat + Tests + Docs entries                        |
