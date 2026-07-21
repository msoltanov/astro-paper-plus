---
author: Альберто Педомо
pubDatetime: "2024-09-08T20:58:52.737Z"
modDatetime: "2025-03-22T09:25:46.734Z"
title: Как добавлять уравнения LaTeX в записи блога на Astro
tags:
  - docs
description: Узнайте, как добавлять уравнения LaTeX в записи блога на Astro с помощью Markdown, KaTeX и плагинов remark/rehype.
---

Этот документ демонстрирует, как использовать уравнения LaTeX в файлах Markdown для AstroPaper+ (форк AstroPaper от [Sat Naing](https://github.com/satnaing)). LaTeX — мощная система вёрстки, часто используемая для математических и научных документов.

<figure>
  <img src="https://images.pexels.com/photos/22690748/pexels-photo-22690748/free-photo-of-close-up-of-complicated-equations-written-on-a-blackboard.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" alt="Крупный план сложных уравнений на классной доске, демонстрирующий символы химии и математики. Стоковое фото" />
  <figcaption class="text-center">
    Фото: <a href="https://www.pexels.com/photo/close-up-of-complicated-equations-written-on-a-blackboard-22690748/">Виталий Гариев</a>
  </figcaption>
</figure>

## Table of contents

## Инструкции

В этом разделе вы найдёте инструкции о том, как добавить поддержку LaTeX в файлы Markdown для AstroPaper+.

1. Установите необходимые плагины remark и rehype:

```bash
pnpm install rehype-katex remark-math katex

```

2. Обновите конфигурацию Astro, чтобы использовать эти плагины:

```ts file=astro.config.ts
// ...
import remarkMath from "remark-math";

import rehypeKatex from "rehype-katex";

export default defineConfig({
  // ...
  markdown: {
    remarkPlugins: [
      remarkMath, // [!code ++]
      remarkToc,
      [remarkCollapse, { test: "Table of contents" }],
    ],
    rehypePlugins: [rehypeKatex], // [!code ++]
    shikiConfig: {
      // Больше тем: https://shiki.style/themes
      themes: { light: "min-light", dark: "night-owl" },
      wrap: false,
    },
  },
  // ...
});
```

3. Импортируйте CSS KaTeX в файле основного макета:

```astro file=src/layouts/Layout.astro
---
import { SITE } from "@config";
// код astro
---

<!doctype html>
<!-- Другие элементы -->
<meta property="og:image" content={socialImageURL} />
<!-- [!code highlight:4] -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.css"
/>
<body>
  <slot />
</body>
```

4. В качестве последнего шага добавьте цвет текста для `katex` в `typography.css`:

```css file=src/styles/typography.css
@plugin "@tailwindcss/typography";

@layer base {
  /* другие классы */

  /* Цвет текста Katex */
  /* [!code highlight:3] */
  .prose .katex-display {
    @apply text-foreground;
  }

  /* ===== Code Blocks & Syntax Highlighting ===== */
  /* другие классы */
}
```

И _вуаля_ — эта настройка позволяет писать уравнения LaTeX в файлах Markdown, которые будут корректно отрендерены при сборке сайта. После этого остальной документ будет отображаться правильно.

---

## Встроенные уравнения

Встроенные уравнения записываются между одинарными знаками доллара `$...$`. Вот несколько примеров:

1. Знаменитая формула эквивалентности массы и энергии: `$E = mc^2$`
2. Формула корней квадратного уравнения: `$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$`
3. Тождество Эйлера: `$e^{i\pi} + 1 = 0$`

---

## Блочные уравнения

Для более сложных уравнений или когда вы хотите, чтобы уравнение отображалось на отдельной строке, используйте двойные знаки доллара `$$...$$`:

Интеграл Гаусса:

```bash
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

```

Определение дзета-функции Римана:

```bash
$$
\zeta(s) = \sum_{n=1}^{\infty} \frac{1}{n^s}
$$

```

Уравнения Максвелла в дифференциальной форме:

```bash
$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\left(\mathbf{J} + \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}\right)
\end{aligned}
$$

```

---

## Использование математических символов

LaTeX предоставляет широкий набор математических символов:

- Греческие буквы: `$\alpha$`, `$\beta$`, `$\gamma$`, `$\delta$`, `$\epsilon$`, `$\pi$`
- Операторы: `$\sum$`, `$\prod$`, `$\int$`, `$\partial$`, `$\nabla$`
- Отношения: `$\leq$`, `$\geq$`, `$\approx$`, `$\sim$`, `$\propto$`
- Логические символы: `$\forall$`, `$\exists$`, `$\neg$`, `$\wedge$`, `$\vee$`
