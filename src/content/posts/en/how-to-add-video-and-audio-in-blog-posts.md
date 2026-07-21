---
author: astro-paper-plus
pubDatetime: "2026-07-03T12:00:00.000Z"
title: How to add videos and audio in MDX/Markdown posts
tags:
  - docs
description: Embed YouTube, Vimeo, SoundCloud, Spotify, Loom, Bilibili, Twitch and native HTML5 video/audio in AstroPaper+ posts with a single remark plugin.
---

This post shows how to embed **video** and **audio** in AstroPaper+ posts — both `.md` and `.mdx`. Authors can paste a URL and walk away; everything else is taken care of by a small remark plugin (`remarkEmbeds`) plus two MDX components for full control.

## Table of contents

## Quick example

The simplest authoring pattern: just paste a URL on its own line. The plugin recognises the provider, generates the embed markup, and wraps it in a styled `<figure>`.

### YouTube

A `youtube.com/watch?v=…` URL on its own line:

```md
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

becomes:

https://www.youtube.com/watch?v=dQw4w9WgXcQ

### Vimeo

A `vimeo.com/<id>` URL:

```md
https://vimeo.com/76979871
```

becomes:

https://vimeo.com/76979871

### A short URL is fine too

`youtu.be` works the same way:

```md
https://youtu.be/dQw4w9WgXcQ
```

becomes:

https://youtu.be/dQw4w9WgXcQ

> ℹ YouTube embeds use the privacy-respecting `youtube-nocookie.com` domain — no tracking until a reader actually presses play.

## Native media (HTML5)

If you self-host the file, just paste its URL on its own line. The plugin recognises the file extension and emits a proper `<audio>` / `<video>` element with `controls preload="metadata"`.

### Audio

```md
https://www.w3.org/2010/05/sound/sound_90.mp3
```

becomes:

https://www.w3.org/2010/05/sound/sound_90.mp3

### Video

```md
https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4
```

becomes:

https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4

> Tip: store static media in `public/media/<post-slug>/…` and reference it as `/media/<post-slug>/file.mp4` — Astro copies `public/` to the site root verbatim.

## Link syntax (with captions)

The familiar `[label](url)` syntax also works, and `url "title"` after the link supplies the figcaption:

```md
[Demo video](https://youtu.be/dQw4w9WgXcQ "Demo video")
```

renders as:

[Demo video](https://youtu.be/dQw4w9WgXcQ "Demo video")

## MDX components (full control)

When authors want explicit control — say, a custom aspect ratio, or a figcaption that's separate from the URL — both `<VideoEmbed>` and `<AudioEmbed>` are registered as MDX components. The provider list is the same one `remarkEmbeds` uses, so adding a new provider in `src/utils/remarkEmbeds.ts` lights it up everywhere.

```mdx
<VideoEmbed provider="youtube" id="dQw4w9WgXcQ" title="Loom-style recording" />
<AudioEmbed
  src="https://www.w3.org/2010/05/sound/sound_90.mp3"
  title="Test tone"
/>
<AudioEmbed
  provider="soundcloud"
  id="https://soundcloud.com/forss/flickermood"
/>
```

`<VideoEmbed provider="…" id="…" />` accepts the same `provider` ids as the markdown path (`youtube`, `vimeo`, `loom`, `bilibili`, `twitch`, `soundcloud`, `spotify`).

## Why a remark plugin (not just MDX components)

Most posts in this blog are `.md`, not `.mdx`. If we only shipped `<VideoEmbed />` as an MDX component, every markdown author would have to migrate to MDX or hand-roll `<iframe>` HTML. `remarkEmbeds` lets `.md` and `.mdx` authors use the same authoring style. The plugin detects provider URLs and native media, replaces the AST node with raw HTML, and the CSS in `src/styles/typography.css` themes everything consistently.

## How it works under the hood

1. **Provider list** lives in `src/utils/remarkEmbeds.ts`. Each `Provider` has a `match(url)` (returns a resource id or `null`) and a `render(id, title)` (returns iframe HTML).
2. **A single remark pass** walks the AST twice: once for paragraphs whose only content is a URL (the "bare URL" pattern), once for `link` nodes whose `url` matches a provider. Both branches replace the relevant node with a `<figure data-embed="…">` wrapper.
3. **Native media** is detected by file extension: `.mp4 .webm .mov .m4v .ogv` → `<video>`, `.mp3 .wav .ogg .m4a .aac .flac .opus` → `<audio>`. Both emit `<figure data-embed="video"|"audio">` wrappers with the same styling contract as the provider embeds.
4. **MDX components** wrap `<figure data-embed="…">` around the same `provider.render()` helpers, so DOM output is identical between `.md` and `.mdx`.

## Provider registry reference

| Provider   | URL shapes                                                    | Privacy default                  |
| ---------- | ------------------------------------------------------------- | -------------------------------- |
| YouTube    | `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…` | `youtube-nocookie.com` (default) |
| Vimeo      | `vimeo.com/<id>`, `player.vimeo.com/video/<id>`               | `player.vimeo.com`               |
| Loom       | `loom.com/share/<id>`                                         | `loom.com/embed/<id>`            |
| Bilibili   | `bilibili.com/video/<bvid>`                                   | `player.bilibili.com`            |
| Twitch     | `twitch.tv/videos/<id>`                                       | `player.twitch.tv`               |
| SoundCloud | `soundcloud.com/<user>/<track>`                               | `w.soundcloud.com/player/`       |
| Spotify    | `open.spotify.com/<episode                                    | track                            | album>/…` | `open.spotify.com/embed/…` |

## Enabling it in your fork

The plugin and CSS are wired in this repo, but if you copied AstroPaper+ before this change, the steps are:

1. **Drop the plugin** at `src/utils/remarkEmbeds.ts` (already there).
2. **Add it to the plugin list** in `src/remark-plugins.ts`:

   ```ts
   import remarkEmbeds from "./utils/remarkEmbeds";

   export const remarkPlugins: PluggableList = [
     remarkMermaid,
     remarkToc,
     [remarkCollapse, { test: "Table of contents" }],
     remarkEmbeds, // <-- new
     remarkRetina,
   ];
   ```

3. **Wire the MDX components** in `astro.config.ts`:

   ```ts
   import VideoEmbed from "./src/components/VideoEmbed.astro";
   import AudioEmbed from "./src/components/AudioEmbed.astro";

   integrations: [
     mdx({ components: { VideoEmbed, AudioEmbed } }),
     sitemap(),
   ],
   ```

4. **Add the styles** (the block under "Embeds" in `src/styles/typography.css`) — they cap embed width, ensure 16:9 iframe video, and reserve sensible heights for Spotify / SoundCloud / Twitch.

That's it. Markdown authors can now paste a URL and the rest is automatic.

---

> **Originally written for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
