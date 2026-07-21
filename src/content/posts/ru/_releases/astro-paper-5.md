---
pubDatetime: "2025-03-08T08:18:19.693Z"
title: AstroPaper+ 5.0 (upstream-релиз — унаследован AstroPaper+)
featured: false
ogImage: ../../../../assets/images/AstroPaper+-v5.png
tags:
  - release
description: "AstroPaper+ v5: сохраняем чистый вид, обновления под капотом. (Upstream-релиз сохранён в истории форка AstroPaper+.)"
---

<!--
Fork notice: этот пост описывает историю upstream-релизов AstroPaper+, сохранённую
дословно в форке AstroPaper+ для контекста. AstroPaper+ строится поверх этих
upstream-релизов. См. оригинальный проект от [], а также
https://github.com/msoltanov/astro-paper-plus для форка.
-->

Наконец-то долгожданный AstroPaper+ v5 здесь. AstroPaper+ v5 сохраняет тот же минималистичный и чистый вид, но приносит значительные обновления под капотом.

![AstroPaper+ v5](@/assets/images/AstroPaper+-v5.png)

## Table of contents

## Крупные изменения

### Обновление до Astro v5 #455

AstroPaper+ теперь поставляется с Astro v5, привнося все новые функции и улучшения, которые идут с ним.

### Tailwind v4

AstroPaper+ был обновлён до Tailwind v4, что включает множество изменений стилей под капотом. Файл `tailwind.config.js` удалён, и теперь вся конфигурация находится в файле `src/styles/global.css`. Типографические стили вынесены и перемещены в `src/styles/typography.css`. Из-за нового поведения TailwindCSS v4 стили внутри блоков `<style>` в компонентах были удалены и заменены инлайн-классами Tailwind. Кроме того, была обновлена цветовая палитра по всему UI. Теперь новая палитра состоит всего из пяти цветов:

```css
:root,
html[data-theme="light"] {
  --background: #fdfdfd;
  --foreground: #282728;
  --accent: #006cac;
  --muted: #e6e6e6;
  --border: #ece9e9;
}

html[data-theme="dark"] {
  --background: #212737;
  --foreground: #eaedf3;
  --accent: #ff6b01;
  --muted: #343f60bf;
  --border: #ab4b08;
}
```

### Удаление React + Fuse.js в пользу поиска Pagefind

В предыдущих версиях React.js и Fuse.js использовались для поиска и генерации OG-изображений. В AstroPaper+ v5 React.js был удалён и заменён на [Pagefind](https://pagefind.app/) — инструмент статического поиска. Опыт поиска почти такой же, как в предыдущих версиях, но теперь индексируется и доступен для поиска весь контент, а не только заголовки и описания, благодаря Pagefind. Идея использовать Pagefind в режиме dev была вдохновлена [этой записью блога](https://chrispennington.blog/blog/pagefind-static-search-for-astro-sites/).

### Обновлённый алиас импорта

Алиас импорта обновлён с `@directory` на `@/directory`, то есть теперь нужно импортировать так:

```astro
---
import { slugifyStr } from "@/utils/slugify";

import IconHash from "@/assets/icons/IconHash.svg";
---
```

### Переход на `pnpm`

AstroPaper+ переключился с `npm` на `pnpm`, который предлагает более быстрое и эффективное управление пакетами.

### Замена icons/svg на Svg-компонент Astro

AstroPaper+ v5 заменяет инлайн-SVG на экспериментальный [Svg-компонент](https://docs.astro.build/en/reference/experimental-flags/svg/) Astro. Это обновление уменьшает необходимость в заранее определённом SVG-коде в объекте `socialIcons`, делая кодовую базу чище и проще в поддержке.

### Отделение констант от конфигурации

Структура проекта была реорганизована. Файл `src/config.ts` теперь содержит только объект `SITE`, который хранит основную конфигурацию проекта. Все константы, такие как `LOCALE`, `SOCIALS` и `SHARE_LINKS`, перенесены в файл `src/constants.ts`.

## Другие заметные изменения

- Каталог записей блога обновлён с `src/content/blog/` на `src/data/blog/`.
- Файл определения коллекций (`src/content/config.ts`) теперь заменён на `src/content.config.ts`.
- Различные зависимости были обновлены для улучшения производительности и безопасности.
- Удалён шрифт `IBM Plex Mono`, переход на стандартный системный моно-шрифт.
- Логика кнопки «Назад» была обновлена. Теперь вместо использования браузерного history API AstroPaper+ v5 использует сессию браузера для временного хранения URL возврата. Если URL возврата в сессии отсутствует, будет выполнен редирект на главную страницу.
- Есть также некоторые незначительные изменения стилей и макета.

## Заключение

AstroPaper+ v5 приносит много изменений, но основной опыт остаётся прежним. Наслаждайтесь более гладкой и эффективной блог-платформой, сохраняя чистый и минималистичный дизайн, которым известен AstroPaper+! Не стесняйтесь исследовать изменения и делиться мыслями. Как всегда, спасибо за вашу поддержку! Если вам нравится эта тема, пожалуйста, поставьте звезду репозиторию. Также можете поддержать проект через GitHub Sponsors или угостить Sat Naing кофе, если хотите. Однако, разумеется, эти действия совершенно необязательны. Приятного пользования!

[Sat Naing](https://github.com/satnaing)

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
