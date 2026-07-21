---
author: FjellOverflow
pubDatetime: "2024-07-25T11:11:53Z"
modDatetime: "2025-03-12T12:28:53Z"
title: Как подключить комментарии Giscus к AstroPaper+
featured: false
draft: false
tags:
  - astro
  - blog
  - docs
description: Функция комментариев на статическом блоге, размещённом на GitHub Pages, с Giscus.
---

Хостинг лёгкого статического блога на такой платформе, как [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), даёт множество преимуществ, но лишает части интерактивности. К счастью, есть [Giscus](https://giscus.app/), который позволяет встраивать пользовательские комментарии в статические сайты.

## Table of contents

## Как работает Giscus

[Giscus использует GitHub API](https://github.com/giscus/giscus?tab=readme-ov-file#how-it-works) для чтения и хранения комментариев, оставленных пользователями _GitHub_ в `Discussions`, привязанных к репозиторию. Встройте клиентский скрипт-бандл _Giscus_ на свой сайт, настройте его с правильным URL репозитория — и пользователи смогут читать и писать комментарии (когда залогинены в _GitHub_). Подход бессерверный, поскольку комментарии хранятся в _GitHub_ и динамически подгружаются оттуда на клиенте, что идеально для статического блога вроде _AstroPaper+_.

## Настройка Giscus

_Giscus_ легко настроить на [giscus.app](https://giscus.app/), но я всё же кратко опишу процесс.

### Требования

Чтобы _Giscus_ заработал, нужно:

- репозиторий должен быть [публичным](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility#making-a-repository-public)
- приложение [Giscus](https://github.com/apps/giscus) должно быть установлено
- в репозитории должна быть включена функция [Discussions](https://docs.github.com/en/github/administering-a-repository/managing-repository-settings/enabling-or-disabling-github-discussions-for-a-repository)

Если любое из этих условий нельзя выполнить, к сожалению, _Giscus_ не получится интегрировать.

### Конфигурация Giscus

Дальше нужно сконфигурировать _Giscus_. В большинстве случаев подходят значения по умолчанию — меняйте их только если есть конкретная причина и вы понимаете, что делаете. Не переживайте, что выберете что-то не так: настройки всегда можно поменять позже. Однако вам нужно:

- выбрать правильный язык для UI
- указать репозиторий _GitHub_, который вы хотите подключить, как правило — репозиторий со статически размещённым блогом _AstroPaper+_ на _GitHub Pages_
- создать и настроить обсуждение типа `Announcement` в _GitHub_, если хотите, чтобы никто не мог создавать случайные комментарии прямо в _GitHub_
- определить цветовую схему

После настройки параметров _Giscus_ выдаёт сгенерированный тег `<script>`, который понадобится на следующих шагах.

## Простой тег script

У вас должен получиться тег script такого вида:

```html
<script
  src="https://giscus.app/client.js"
  data-repo="[ENTER REPO HERE]"
  data-repo-id="[ENTER REPO ID HERE]"
  data-category="[ENTER CATEGORY NAME HERE]"
  data-category-id="[ENTER CATEGORY ID HERE]"
  data-mapping="pathname"
  data-strict="0"
  data-reactions-enabled="1"
  data-emit-metadata="0"
  data-input-position="bottom"
  data-theme="preferred_color_scheme"
  data-lang="en"
  crossorigin="anonymous"
  async
></script>
```

Просто добавьте его в исходный код сайта. Скорее всего, если вы используете _AstroPaper+_ и хотите включить комментарии к записям, перейдите в `PostDetails.astro` и вставьте его туда, где хотите видеть комментарии — например, под кнопками «Поделиться этой записью в:».

```astro file=src/layouts/PostDetails.astro
<Layout {...layoutProps}>
  <main>
    <ShareLinks />
    <!-- [!code ++:6] -->
    <script
      src="https://giscus.app/client.js"
      data-repo="[ENTER REPO HERE]"
      data-repo-id="[ENTER REPO ID HERE]"
      data-category="[ENTER CATEGORY NAME HERE]"
      data-category-id="[ENTER CATEGORY ID HERE]"></script>
  </main>
  <Footer />
</Layout>
```

Готово! Вы успешно интегрировали комментарии в _AstroPaper+_!

## React-компонент со светлой/тёмной темой

Встроенный тег script в макете довольно статичен — конфигурация _Giscus_, включая `theme`, захардкожена в макет. Учитывая, что в _AstroPaper+_ есть переключатель светлой/тёмной темы, было бы здорово, чтобы комментарии плавно переключались между светлой и тёмной темой вместе с остальным сайтом. Для этого нужен более продвинутый подход к встраиванию _Giscus_.

Сначала установим [React-компонент](https://www.npmjs.com/package/@giscus/react) для _Giscus_:

```bash
npm i @giscus/react && npx astro add react

```

Затем создадим новый React-компонент `Comments.tsx` в `src/components`:

```tsx file=src/components/Comments.tsx
import Giscus, { type Theme } from "@giscus/react";

import { GISCUS } from "@/constants";
import { useEffect, useState } from "react";

interface CommentsProps {
  lightTheme?: Theme;
  darkTheme?: Theme;
}

export default function Comments({
  lightTheme = "light",
  darkTheme = "dark",
}: CommentsProps) {
  const [theme, setTheme] = useState(() => {
    const currentTheme = localStorage.getItem("theme");
    const browserTheme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
    return currentTheme || browserTheme;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = ({ matches }: MediaQueryListEvent) => {
      setTheme(matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const themeButton = document.querySelector("#theme-btn");
    const handleClick = () => {
      setTheme(prevTheme => (prevTheme === "dark" ? "light" : "dark"));
    };
    themeButton?.addEventListener("click", handleClick);
    return () => themeButton?.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="mt-8">
      <Giscus theme={theme === "light" ? lightTheme : darkTheme} {...GISCUS} />
    </div>
  );
}
```

Этот _React_-компонент не только оборачивает нативный _Giscus_-компонент, но и добавляет дополнительные пропсы — `lightTheme` и `darkTheme`. Используя два слушателя событий, комментарии _Giscus_ будут синхронизированы с темой сайта, динамически переключаясь между тёмной и светлой, когда меняется тема сайта или браузера.

Также нужно задать конфиг `GISCUS`, оптимальное место для которого — `constants.ts`:

```ts file=src/constants.ts
import type { GiscusProps } from "@giscus/react";
// ...

export const GISCUS: GiscusProps = {
  repo: "[ENTER REPO HERE]",
  repoId: "[ENTER REPO ID HERE]",
  category: "[ENTER CATEGORY NAME HERE]",
  categoryId: "[ENTER CATEGORY ID HERE]",
  mapping: "pathname",
  reactionsEnabled: "0",
  emitMetadata: "0",
  inputPosition: "bottom",
  lang: "en",
  loading: "lazy",
};
```

Учтите, что указание `theme` здесь переопределит пропсы `lightTheme` и `darkTheme`, в результате чего тема будет статичной — как и в предыдущем подходе со встраиванием _Giscus_ через тег `<script>`.

Чтобы завершить процесс, добавьте новый компонент Comments в `PostDetails.astro` (заменив тег `script` из предыдущего шага).

```jsx file=src/layouts/PostDetails.astro
// [!code ++:1]
import Comments from "@/components/Comments";

<ShareLinks />
// [!code ++:1]
<Comments client:only="react" />

<hr class="my-6 border-dashed" />

<Footer />

```

Готово!
