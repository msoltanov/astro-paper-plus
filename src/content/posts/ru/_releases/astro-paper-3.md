---
pubDatetime: "2023-09-25T10:25:54.547Z"
title: AstroPaper+ 3.0 (upstream-релиз — унаследован AstroPaper+)
featured: false
description: "AstroPaper+ версии 3: новый уровень веб-опыта с Astro v3 и плавными View Transitions (Upstream-релиз сохранён в истории форка AstroPaper+)."
---

<!--
Fork notice: этот пост описывает историю upstream-релизов AstroPaper+, сохранённую
дословно в форке AstroPaper+ для контекста. AstroPaper+ строится поверх этих
upstream-релизов. См. [оригинальный проект от Sat Naing](https://github.com/satnaing/astro-paper), а также
https://github.com/msoltanov/astro-paper-plus для форка.
-->

Мы рады объявить о выходе AstroPaper+ v3, наполненного новыми возможностями, улучшениями и исправлениями багов, чтобы вывести ваш опыт веб-разработки на новый уровень. Давайте окунёмся в основные моменты этого релиза:

![AstroPaper+ v3](@/assets/images/AstroPaper+-v3.png)

## Table of contents

## Возможности и изменения

### Интеграция с Astro v3

<video autoplay loop="loop" muted="muted" plays-inline="true">
  <source src="#" type="video/mp4">
  <!-- <source src="/assets/docs/astro-paper-v3-view-transitions-demo.mp4" type="video/mp4"> -->
</video>

AstroPaper+ теперь полностью поддерживает [Astro v3](https://astro.build/blog/astro-3/), что даёт лучшую производительность и скорость рендеринга. Кроме того, мы добавили поддержку [ViewTransitions API](https://docs.astro.build/en/guides/view-transitions/) Astro, позволяющую создавать завораживающие и динамичные переходы между представлениями. В секции «Свежее» теперь отображаются только записи без пометки featured, чтобы избежать дублирования и лучше поддержать ViewTransitions API.

### Обновлённая логика генерации OG-изображений

![Пример OG-изображения](https://user-images.githubusercontent.com/40914272/269252964-a0dc6735-80f7-41ed-8e74-4d4d70f96891.png)

Мы обновили логику автоматической генерации OG-изображений, сделав её ещё надёжнее и эффективнее. Кроме того, теперь она поддерживает спецсимволы в заголовках записей, обеспечивая точные, гибкие и привлекательные превью в соцсетях. `SITE.ogImage` теперь необязателен. Если он не указан, AstroPaper+ автоматически сгенерирует OG-изображение, используя `SITE.title`, `SITE.desc` и `SITE.website`.

### Мета-тег темы

Добавлен мета-тег theme-color, который динамически подстраивается при переключении темы, обеспечивая бесшовный пользовательский опыт.

> Заметьте разницу вверху **_AstroPaper v2 — переключение темы_**

<video autoplay loop="loop" muted="muted" plays-inline="true">
  <source src="#" type="video/mp4">
</video>

**_AstroPaper v3 — переключение темы_**

<video autoplay loop="loop" muted="muted" plays-inline="true">
  <source src="#" type="video/mp4">
</video>

## Другие изменения

### Astro Prettier Plugin

Astro Prettier Plugin установлен из коробки, чтобы проект оставался аккуратным и организованным.

### Незначительные изменения стилей

Исправлена проблема с переносом однострочных блоков кода — ваши фрагменты кода теперь выглядят безупречно. Обновлён стиль навигации, чтобы можно было добавлять больше ссылок в меню.

## Обновление до AstroPaper+ v3

> Этот раздел только для тех, кто хочет обновить AstroPaper+ v3 с более старых версий. Он поможет мигрировать с AstroPaper+ v2 на AstroPaper+ v3. До чтения этого раздела вы также можете заглянуть в эту статью по обновлению зависимостей и AstroPaper+.

### Вариант 1: Чистый старт (рекомендуется)

В этом релизе сделано много изменений — заменены старые API Astro на новые, исправлены баги, добавлены новые возможности и т.д. Поэтому если вы не сильно кастомизировали, лучше использовать этот подход.

**_Шаг 1: Сохраните все ваши обновлённые файлы_**

Важно сохранить все файлы, которые вы уже обновляли. Среди них:

- `/src/config.ts` (в v3 не трогали)
- `/src/styles/base.css` (в v3 — незначительные изменения; см. ниже)
- `/src/assets/` (в v3 не трогали)
- `/public/assets/` (в v3 не трогали)
- `/content/blog/` (это каталог вашего блога 🤷🏻‍♂️)
- Любые другие ваши кастомизации.

```css
/* file: /src/styles/base.css */
@layer base {
  /* Другой код */
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-skin-card-muted;
  }
  /* Старый код
  code {
    white-space: pre;
    overflow: scroll;
  } */
  /* Новый код */
  code,
  blockquote {
    word-wrap: break-word;
  }
  pre > code {
    white-space: pre;
  }
}

@layer components {
  /* другой код */
}
```

**_Шаг 2: Замените всё остальное на AstroPaper+ v3_**

На этом шаге замените всё, _кроме_ указанных выше файлов и каталогов (плюс ваших кастомных файлов/каталогов), на AstroPaper+ v3.

**_Шаг 3: Обновления схемы_**

Имейте в виду, что `/src/content/_schemas.ts` был заменён на `/src/content/config.ts`. Кроме того, больше нет экспортируемого типа `BlogFrontmatter` из `/src/content/config.ts`. Поэтому все упоминания типа `BlogFrontmatter` в файлах нужно заменить на `CollectionEntry<"blog">["data"]`. Например, в `src/components/Card.tsx`:

```ts
// AstroPaper+ v2
import type { BlogFrontmatter } from "@content/_schemas";

export interface Props {
  href?: string;
  frontmatter: BlogFrontmatter;
  secHeading?: boolean;
}
```

```ts
// AstroPaper+ v3
import type { CollectionEntry } from "astro:content";

export interface Props {
  href?: string;
  frontmatter: CollectionEntry<"blog">["data"];
  secHeading?: boolean;
}
```

### Вариант 2: Обновление через Git

Этот подход не рекомендуется большинству пользователей. Делайте «Вариант 1», если можете. Прибегайте к нему, только если вы умеете разрешать merge-конфликты и понимаете, что делаете. На самом деле Sat Naing уже написал блог-пост для этого случая — загляните сюда.

## Заключение

Готовы исследовать захватывающие новые возможности и улучшения в AstroPaper+ v3? Начните использовать AstroPaper+ прямо сейчас. Про другие исправления багов и обновления интеграций читайте в release notes. Если наткнётесь на баги или столкнётесь с трудностями при обновлении, открывайте issue или начинайте обсуждение на GitHub.

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
