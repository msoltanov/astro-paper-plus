---
author: astro-paper-plus
pubDatetime: "2026-07-03T12:00:00.000Z"
title: Как добавлять видео и аудио в записи MDX/Markdown
tags:
  - docs
description: Встраивание YouTube, Vimeo, SoundCloud, Spotify, Loom, Bilibili, Twitch и нативного HTML5 video/audio в записи AstroPaper+ одним remark-плагином.
---

Этот пост показывает, как встраивать **видео** и **аудио** в записи AstroPaper+ — как в `.md`, так и в `.mdx`. Авторы могут просто вставить URL на отдельной строке; всё остальное берёт на себя небольшой remark-плагин (`remarkEmbeds`) и два MDX-компонента для полного контроля.

## Table of contents

## Быстрый пример

Самый простой авторский паттерн: просто вставьте URL на отдельной строке. Плагин распознаёт провайдера, генерирует разметку встраивания и оборачивает её стилизованным `<figure>`.

### YouTube

URL вида `youtube.com/watch?v=…` на отдельной строке:

https://www.youtube.com/watch?v=dQw4w9WgXcQ

превращается в:

```md
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### Vimeo

URL вида `vimeo.com/<id>`:

https://vimeo.com/76979871

### Короткий URL тоже подходит

`youtu.be` работает так же:

https://youtu.be/dQw4w9WgXcQ

> ℹ YouTube-встраивания используют privacy-respecting домен `youtube-nocookie.com` — никакого трекинга, пока читатель действительно не нажмёт play.

## Нативные медиа (HTML5)

Если вы хостите файл сами, просто вставьте его URL на отдельной строке. Плагин распознаёт расширение файла и выдаёт корректный элемент `<audio>` / `<video>` с `controls preload="metadata"`.

### Аудио

https://www.w3.org/2010/05/sound/sound_90.mp3

```md
https://www.w3.org/2010/05/sound/sound_90.mp3
```

### Видео

```md
https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4
```

https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4

> Совет: храните статичные медиа в `public/media/<post-slug>/…` и ссылайтесь на них как `/media/<post-slug>/file.mp4` — Astro копирует `public/` в корень сайта как есть.

## Синтаксис с подписью (через ссылку)

Привычный синтаксис `[label](url)` тоже работает, а `url "title"` после ссылки задаёт figcaption:

```md
[Демо-видео](https://youtu.be/dQw4w9WgXcQ "Демо-видео")
```

рендерится как:

[Демо-видео](https://youtu.be/dQw4w9WgXcQ "Демо-видео")

## MDX-компоненты (полный контроль)

Когда авторам нужен явный контроль — скажем, своё соотношение сторон или figcaption, отделённый от URL — `<VideoEmbed>` и `<AudioEmbed>` зарегистрированы как MDX-компоненты. Список провайдеров тот же, что использует `remarkEmbeds`, поэтому добавление нового провайдера в `src/utils/remarkEmbeds.ts` подключает его везде.

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

`<VideoEmbed provider="…" id="…" />` принимает те же `provider` id, что и markdown-путь (`youtube`, `vimeo`, `loom`, `bilibili`, `twitch`, `soundcloud`, `spotify`).

## Почему remark-плагин, а не просто MDX-компоненты

Большинство постов в этом блоге — это `.md`, а не `.mdx`. Если бы мы поставляли только `<VideoEmbed />` как MDX-компонент, каждому markdown-автору пришлось бы мигрировать на MDX или вручную писать HTML для `<iframe>`. `remarkEmbeds` позволяет авторам `.md` и `.mdx` использовать одинаковый стиль. Плагин обнаруживает URL провайдеров и нативные медиа, заменяет узел AST на сырой HTML, а CSS в `src/styles/typography.css` единообразно тематизирует всё.

## Как это работает внутри

1. **Список провайдеров** лежит в `src/utils/remarkEmbeds.ts`. У каждого `Provider` есть `match(url)` (возвращает id ресурса или `null`) и `render(id, title)` (возвращает HTML iframe).
2. **Один проход remark** обходит AST дважды: один раз для параграфов, единственное содержимое которых — URL (паттерн «голый URL»), и один раз для узлов `link`, у которых `url` совпадает с провайдером. Обе ветки заменяют соответствующий узел обёрткой `<figure data-embed="…">`.
3. **Нативные медиа** определяются по расширению файла: `.mp4 .webm .mov .m4v .ogv` → `<video>`, `.mp3 .wav .ogg .m4a .aac .flac .opus` → `<audio>`. Оба выдают обёртки `<figure data-embed="video"|"audio">` с тем же контрактом стилей, что и провайдерские встраивания.
4. **MDX-компоненты** оборачивают `<figure data-embed="…">` вокруг тех же хелперов `provider.render()`, поэтому DOM-вывод идентичен между `.md` и `.mdx`.

## Справочник по реестру провайдеров

| Провайдер | Форматы URL | Privacy по умолчанию |
| ---------- | ------------------------------------------------------------- | ------------------------------------- | --------- | -------------------------- |
| YouTube | `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…` | `youtube-nocookie.com` (по умолчанию) |
| Vimeo | `vimeo.com/<id>`, `player.vimeo.com/video/<id>` | `player.vimeo.com` |
| Loom | `loom.com/share/<id>` | `loom.com/embed/<id>` |
| Bilibili | `bilibili.com/video/<bvid>` | `player.bilibili.com` |
| Twitch | `twitch.tv/videos/<id>` | `player.twitch.tv` |
| SoundCloud | `soundcloud.com/<user>/<track>` | `w.soundcloud.com/player/` |
| Spotify | `open.spotify.com/<episode                                    | track                                 | album>/…` | `open.spotify.com/embed/…` |

## Подключение в вашем форке

Плагин и стили уже подключены в этом репозитории, но если вы скопировали AstroPaper+ до этого изменения, шаги такие:

1. **Положите плагин** по пути `src/utils/remarkEmbeds.ts` (он уже там).
2. **Добавьте его в список плагинов** в `src/remark-plugins.ts`:

```ts
import remarkEmbeds from "./utils/remarkEmbeds";

export const remarkPlugins: PluggableList = [
  remarkMermaid,
  remarkToc,
  [remarkCollapse, { test: "Table of contents" }],
  remarkEmbeds, // <-- новый
  remarkRetina,
];
```

3. **Подключите MDX-компоненты** в `astro.config.ts`:

```ts
import VideoEmbed from "./src/components/VideoEmbed.astro";

import AudioEmbed from "./src/components/AudioEmbed.astro";

integrations: [
  mdx({ components: { VideoEmbed, AudioEmbed } }),
  sitemap(),
],

```

4. **Добавьте стили** (блок под «Embeds» в `src/styles/typography.css`) — они ограничивают ширину встраиваний, обеспечивают 16:9 для iframe-видео и задают разумные высоты для Spotify / SoundCloud / Twitch.

Готово. Авторы Markdown теперь могут просто вставить URL, а всё остальное автоматически.
