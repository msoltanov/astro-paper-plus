---
pubDatetime: "2023-01-30T15:57:52.737Z"
title: AstroPaper+ 2.0 (upstream-релиз — унаследован AstroPaper+)
featured: false
ogImage: https://user-images.githubusercontent.com/53733092/215771435-25408246-2309-4f8b-a781-1f3d93bdf0ec.png
tags:
  - release
description: AstroPaper+ с улучшениями Astro v2. Типобезопасный markdown-контент, исправления багов и лучший DX и т.д. (Upstream-релиз сохранён в истории форка AstroPaper+.)
---

<!--
Fork notice: этот пост описывает историю upstream-релизов AstroPaper+, сохранённую
дословно в форке AstroPaper+ для контекста. AstroPaper+ строится поверх этих
upstream-релизов. См. [оригинальный проект от Sat Naing](https://github.com/satnaing/astro-paper), а также
https://github.com/msoltanov/astro-paper-plus для форка.
-->

Astro 2.0 вышел с рядом классных возможностей, ломающих изменений, улучшениями DX, лучшим оверлеем ошибок и т.д. AstroPaper+ использует эти классные возможности, особенно Content Collections API.

<!-- ![Introducing AstroPaper+ 2.0](https://user-images.githubusercontent.com/53733092/215683840-dc2502f5-8c5a-44f0-a26c-4e7180455056.png) -->

![Представляем AstroPaper+ 2.0](https://user-images.githubusercontent.com/53733092/215771435-25408246-2309-4f8b-a781-1f3d93bdf0ec.png)

## Table of contents

## Возможности и изменения

### Типобезопасный Frontmatter и переопределённая схема блога

Frontmatter markdown-контента AstroPaper+ 2.0 теперь типобезопасен благодаря Content Collections Astro. Схема блога определена в файле `src/content/_schemas.ts`.

### Новое расположение контента блога

Все записи блога перенесены из каталога `src/contents` в `src/content/blog`.

### Новый Fetch API

Контент теперь подгружается через функцию `getCollection`. Больше не нужно указывать относительный путь к контенту.

```ts
// старый способ получения контента
- const postImportResult = import.meta.glob<MarkdownInstance<Frontmatter>>(
  "../contents/**/**/*.md",
);
// новый способ получения контента
+ const postImportResult = await getCollection("blog");

```

### Изменённая логика поиска для лучших результатов

В более старых версиях AstroPaper+ при поиске статьи поисковыми ключами были `title`, `description` и `headings` (headings — все заголовки h1 ~ h6 в записи блога). В AstroPaper+ v2 по мере ввода пользователем ищут только по `title` и `description`.

### Переименованные свойства frontmatter

Следующие свойства frontmatter были переименованы:

| Старые имена | Новые имена |
| ------------ | ----------- |
| datetime     | pubDatetime |
| slug         | postSlug    |

### Тег по умолчанию для записи блога

Если у записи блога нет ни одного тега (то есть свойство `tags` во frontmatter не указано), для этой записи будет использован тег по умолчанию — `others`. Но вы можете задать тег по умолчанию в файле `/src/content/_schemas.ts`:

```ts
// src/contents/_schemas.ts
export const blogSchema = z.object({
  // ---
  // замените "others" на нужное значение
  tags: z.array(z.string()).default(["others"]),
  ogImage: z.string().optional(),
  description: z.string(),
});
```

### Новая готовая тёмная цветовая схема

В AstroPaper+ v2 появилась новая тёмная цветовая схема (высокий контраст и низкий контраст), основанная на тёмном логотипе Astro. Подробнее — по ссылке.

![Новая готовая тёмная цветовая схема](https://user-images.githubusercontent.com/53733092/215680520-59427bb0-f4cb-48c0-bccc-f182a428d72d.svg)

### Автоматическая сортировка классов

AstroPaper+ 2.0 включает автоматическую сортировку классов через [Prettier-плагин TailwindCSS](https://tailwindcss.com/blog/automatic-class-sorting-with-prettier)

### Обновлённая документация и README

Все посты в разделе #docs и README обновлены для AstroPaper+ v2.

## Исправления багов

- исправлены сломанные теги на странице записи блога
- на странице тега последняя часть хлебных крошек теперь приведена к нижнему регистру для согласованности
- черновики исключены со страницы тега
- исправлена проблема «значение onChange не обновляется» после перезагрузки страницы

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
