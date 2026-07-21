---
pubDatetime: "2026-05-17T07:15:45.792Z"
title: AstroPaper+ 6.0 — upstream-релиз (основа форка AstroPaper+ v7.0.0)
featured: true
ogImage: assets/AstroPaper+-v6.png
tags:
  - release
description: "AstroPaper+ v6: полностью переписан с нуля на Astro v6, Tailwind v4 и новой системе конфигурации. Это upstream-релиз, на котором строится форк AstroPaper+ v7.0.0."
---

> **Заметка о форке:** AstroPaper+ (этот форк) построен непосредственно поверх описанного ниже upstream-релиза **AstroPaper+ v6**. Техническое содержимое этого поста описывает upstream AstroPaper+ от [Sat Naing](https://github.com/satnaing);
> см. [страницу «О сайте»](/about) для атрибуции форка. Репозиторий форка — [msoltanov/astro-paper-plus](https://github.com/msoltanov/astro-paper-plus).

AstroPaper+ v6 — полностью переписан с нуля на Astro v6, Tailwind CSS v4 и TypeScript v6. Этот релиз заменяет устаревшую конфигурацию `SITE` / `constants.ts` единым унифицированным файлом конфигурации и вносит несколько структурных улучшений по всей кодовой базе.

![AstroPaper+ v6](assets/AstroPaper+-v6.png)

## Table of contents

## Крупные изменения

### Обновление до Astro v6

AstroPaper+ теперь поставляется с Astro v6.3, что включает:

- **Stable Content Layer API** — загрузчик `glob()` заменяет старый паттерн коллекций `type: "content"`.
- **Stable Fonts API** — `experimental.fonts` перешёл в верхнеуровневый ключ `fonts` в `astro.config.ts`.
- **TypeScript v6** — полная поддержка последней версии компилятора TypeScript.

### Новая унифицированная система конфигурации

Плоский объект `SITE` в `src/config.ts` и отдельный файл `constants.ts` заменены единым `astro-paper.config.ts` в корне проекта. Используйте `defineAstroPaperConfig()` для полного IntelliSense:

```ts file="astro-paper.config.ts"
import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://your-site.com/",
    title: "AstroPaper+",
    description: "…",
    author: "Your Name",
    lang: "en",
    timezone: "UTC",
    googleVerification: "your-verification-value",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000, // мс
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/…/edit/main/",
    },
    search: "pagefind",
  },
  socials: [{ name: "github", url: "https://github.com/…" }],
  shareLinks: [{ name: "x", url: "https://x.com/intent/post?url=" }],
});
```

Все опции — метаданные сайта, пагинация, флаги функций, социальные ссылки и share-ссылки — теперь живут в одном файле.

### Стабильный Fonts API

Конфигурация шрифтов переехала из `experimental.fonts` в верхнеуровневый ключ `fonts` в `astro.config.ts`, что соответствует стабильному API Astro v6:

```ts file="astro.config.ts"
export default defineConfig({
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
    },
  ],
});
```

### Поддержка MDX

`@astrojs/mdx` теперь включён. Записи могут использовать расширение `.mdx` для встраивания компонентов, JSX-выражений и импорта из других файлов. Паттерн загрузчика контента `**/[^_]*.{md,mdx}` автоматически подхватывает оба формата.

### Реструктуризация контентных коллекций

Записи блога переехали из `src/data/blog/` в `src/content/posts/`, что соответствует конвенциям Astro. Новая коллекция `pages` по адресу `src/content/pages/` покрывает автономные страницы (About и т.д.). Коллекция `posts` использует загрузчик `glob()` Astro — `defineCollection` с `type: "content"` больше не используется:

```ts file="src/content.config.ts"
const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      author: z.string(),
      pubDatetime: z.date(),
      title: z.string(),
      tags: z.array(z.string()).default(["others"]),
      description: z.string(),
      // …
    }),
});
```

### Система дизайн-токенов

Палитра из 5 токенов в v5 выросла до 7 токенов в `src/styles/theme.css`. Токены определены как пользовательские CSS-свойства и зарегистрированы в Tailwind v4 через `@theme inline`:

```css file="src/styles/theme.css"
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
}

:root,
[data-theme="light"] {
  --background: #fdfdfd;
  --foreground: #282728;
  --accent: #006cac;
  --accent-foreground: #ffffff;
  --muted: #e6e6e6;
  --muted-foreground: #6b7280;
  --border: #ece9e9;
}

[data-theme="dark"] {
  --background: #212737;
  --foreground: #eaedf3;
  --accent: #ff6b01;
  --accent-foreground: #ffffff;
  --muted: #343f60;
  --muted-foreground: #afb9ca;
  --border: #ab4b08;
}
```

`theme.css` — отдельный файл, импортируемый из `global.css`. Два новых токена: `--accent-foreground` и `--muted-foreground`.

### Извлечение i18n-строк

Все UI-строки извлечены в `src/i18n/lang/en.ts` с интерфейсом `UIStrings`. Добавление нового языка требует только нового файла в `src/i18n/lang/`:

```ts file="src/i18n/lang/en.ts"
export default {
  nav: { home: "Home", posts: "Posts" /* … */ },
  post: { publishedAt: "Published at" /* … */ },
  /* … */
} satisfies UIStrings;
```

Хелпер `tplStr()` обрабатывает параметризованные строки, чтобы переводчики могли свободно переупорядочивать токены.

### Поддержка base path и деплоя в подкаталог

Все внутренние ссылки проходят через `getRelativeLocaleUrl()` и хелперы `withBase.ts` (`stripLocale`, `stripBase`, `getAssetPath`). Деплой в подкаталог (например, `/astro-paper`) работает без ручного обновления ссылок.

### Верификация Google через конфиг

Предпочтительный способ задать верификацию Google — `site.googleVerification` в `astro-paper.config.ts`:

```ts file="astro-paper.config.ts"
export default defineAstroPaperConfig({
  site: {
    // …
    googleVerification: "your-google-site-verification-value",
  },
});
```

Переменная окружения `PUBLIC_GOOGLE_SITE_VERIFICATION` всё ещё поддерживается как запасной вариант, если вы предпочитаете не хранить значение в файле конфигурации:

```bash file=".env"
PUBLIC_GOOGLE_SITE_VERIFICATION=your-google-site-verification-value

```

Когда заданы обе, `site.googleVerification` имеет приоритет.

## Другие заметные изменения

- Обновлены и переименованы вспомогательные/утилитные функции.
- Навигация по соседним записям (предыдущая/следующая) теперь вычисляется один раз в `getStaticPaths` и передаётся через props — компонент больше не подгружает все записи на каждой странице.
- Скопинг `_components/`: компоненты, специфичные для записи, живут под `src/components/post/` и не загрязняют более широкий каталог `src/components/`.
- `PostLayout.astro` отвечает только за структурированные данные и SEO — логика страницы записи живёт в самом файле страницы.

## Итог

AstroPaper+ v6 сохраняет минималистичный, чистый вид, при этом перестраивая внутренности вокруг новых примитивов Astro v6. Система конфигурации проще, кодовая база легче для навигации, и тема поставляется готовой к i18n и деплою в подкаталог из коробки.

## Смотрите также

- [Готовые цветовые схемы](/posts/predefined-color-schemes/)
- [Как настроить тему AstroPaper+](/posts/how-to-configure-astropaper-theme/)
- [Добавление новых записей в AstroPaper+](/posts/adding-new-posts-in-astropaper-theme)

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
