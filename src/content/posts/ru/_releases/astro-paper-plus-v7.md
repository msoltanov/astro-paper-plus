---
author: msoltanov
pubDatetime: "2026-07-08T14:00:00.000Z"
title: "AstroPaper+ 7.0"
featured: true
ogImage: assets/AstroPaper+-v7.png
tags:
  - release
description: "AstroPaper+ v7.0: ребрендинг форка + многоязычный контент (en / ru / tr) + галереи + видео/аудио-эмбеды + rehype-плагины для markdown + кастомный sitemap, поверх upstream AstroPaper v6.1.0."
---

AstroPaper+ v7.0 — первый релиз линейки **AstroPaper+**. Это форк AstroPaper (изначально называвшегося «AstroPaper», от [Sat Naing](https://github.com/satnaing)), опубликованный в [msoltanov/astro-paper-plus](https://github.com/msoltanov/astro-paper-plus). Релиз наслаивается поверх upstream AstroPaper v6.1.0: брендинг **AstroPaper+**, многоязычный контент на поддерживаемых локалях (en / ru / tr), новая коллекция контента `galleries` с лайтбоксом PhotoSwipe v5, видео / аудио-эмбеды через общий реестр провайдеров, конвейер markdown-тела, перестроенный вокруг build-time rehype-плагинов (lazy-image hints, figcaption из `title`, hardening внешних ссылок, permalinks заголовков, slug-based heading IDs), опциональный sticky right-rail table of contents, кастомная интеграция sitemap с эмиссией `<lastmod>` и `<xhtml:link rel="alternate">` hreflang, CLDR-осведомлённая плюрализация, централизованное форматирование дат, авто-извлечение описаний постов из маркера `<!-- more -->`, адаптивные таблицы, унифицированная кнопка «наверх», локальное зеркало CI-аудита `pnpm gate` и агент-командная разметка проекта `.harness/` (без влияния на конечного пользователя). Всё аддитивно — опциональные фичи (`features.enableGalleries`, `tocAside: true`) по умолчанию выключены; никаких ломающих изменений в пользовательской конфигурации или схемах коллекций контента.

![AstroPaper+ v7](assets/AstroPaper+-v7.png)

## Table of contents

## Главное

- **Переименовано в AstroPaper+ v7.** Все видимые пользователю строки читаются как `AstroPaper+ v7`; внутренние TypeScript-идентификаторы (`AstroPaperConfig`, `defineAstroPaperConfig`, …) сохранены, чтобы существующие файлы конфигурации продолжали работать.
- **Многоязычный контент (en / ru / tr)** поставляется из коробки — см. раздел «i18n» ниже.
- **Новые коллекции контента** рядом с posts и projects: `galleries` (лайтбокс PhotoSwipe v5, опционально через `features.enableGalleries`) и видео / аудио-эмбеды (общий реестр провайдеров: YouTube / Vimeo / Loom / Bilibili / Twitch / SoundCloud / Spotify).
- **Конвейер markdown-тела перестроен** вокруг пяти build-time rehype-плагинов — `rehype-slug` для стабильных heading IDs, `rehypeLazyImages` для LCP-корректных loading hints, `rehypeFigureCaption` для title → figcaption, `rehypeExternalLinks` для `target="_blank"` + `rel="noopener noreferrer"` и `rehypeHeadingAnchors` для build-time `#`-permalinks.
- **Sticky right-rail table of contents** (опционально через frontmatter `tocAside: true`) с `IntersectionObserver`-scrollspy и совместимостью с View Transitions.
- **Кастомная интеграция sitemap** (`src/integrations/sitemap.ts`) заменила `@astrojs/sitemap` — эмитит `<lastmod>` для каждого URL, разносит посты в отдельный чанк `sitemap-posts-0.xml` и эмитит `<xhtml:link rel="alternate">` hreflang для четырёх локалей.
- **CLDR-осведомлённая плюрализация + централизованное форматирование дат** — новые хелперы `plural(locale, count, forms)` и `formatDate(date, locale, opts)` в `src/i18n/format.ts`, управляются через настраиваемый `site.dateFormat` в `astro-paper.config.ts`.
- **Авто-извлечение описаний постов из маркера `<!-- more -->`** — срабатывает, когда frontmatter `description:` отсутствует (с учётом fence-блоков и со стрипом markdown-разметки).
- **`pnpm gate`** — локальное зеркало CI pre-publish-аудита (`pnpm test` + `pnpm lint` + `pnpm format:check` + `pnpm build`) с одним лог-файлом.
- **Сохранена атрибуция upstream** — README, About, CONTRIBUTING, шаблоны issue и каждый release-пост ссылаются на upstream-проект `satnaing/astro-paper`.

## Ребрендинг форка

- Заголовок сайта, OG-карточка, заголовок README и бейджи, страницы About (×4 локали), карточки проектов (×4 локали), CONTRIBUTING, шаблоны issue, VS Code-сниппеты, комментарии в коде и CHANGELOG — везде используется имя **AstroPaper+ v7**.
- Имя npm-пакета — `astro-paper-plus`, а `package.json#version` — `7.0.0`.
- `astro-paper.config.ts` содержит явный тег `(AstroPaper+ v7)` в описании сайта, чтобы поисковые сниппеты были однозначными.

## i18n

- Локальные папки `src/content/posts/<locale>/` и параллельные маршруты `src/pages/[locale]/` для en, ru, tr.
- Все UI-строки живут в `src/i18n/lang/<locale>.ts` под типизированным контрактом `UIStrings`; хелпер `tplStr` обрабатывает параметризованные строки, чтобы переводчики могли свободно переупорядочивать токены.
- Переключатель языка в шапке следует за пользователем по страницам и сохраняет выбранную локаль в URL.
- RSS-ленты для каждой локали генерируются по адресу `/<locale>/rss.xml`.
- Русская (`ru`) локаль полностью поддерживается наряду с `en` / `tr`, зеркалится во все per-locale директории контента (`src/content/posts/ru/`, `src/content/projects/ru/`, `src/content/pages/ru/`, `src/content/galleries/ru/`) и поставляет полный CLDR-набор плюрализации (`one` / `few` / `many` / `other`) для русских CLDR-диапазонов, которые другие локали сворачивают в `one` + `other`.

## Коллекции контента

- **`galleries`** — опционально через `features.enableGalleries` в `astro-paper.config.ts`. Per-gallery MDX-файлы под `src/content/galleries/<locale>/<slug>.mdx` с frontmatter `title` / `description` / `pubDatetime` / `coverImage` / `images: [{ src, alt, caption? }]`. Лайтбокс PhotoSwipe v5; CSS подключается только на странице детали; JS импортируется динамически при первом открытии, так что остальной сайт платит ноль байт. Адаптивная сетка миниатюр 2 / 3 / 4 колонки; ре-инициализируется после `astro:after-swap` для совместимости с view-transition.
- **Видео / аудио-эмбеды** — новый плагин `remarkEmbeds` плюс MDX-компоненты `<VideoEmbed>` / `<AudioEmbed>`. Авторы могут вставить голый URL на отдельной строке, использовать синтаксис ссылки с подписью или нативный `<video controls preload="metadata">` для self-hosted MP4. Провайдеры: YouTube (по умолчанию privacy-respecting `youtube-nocookie.com`), Vimeo, Loom, Bilibili, Twitch, SoundCloud, Spotify. Один реестр провайдеров расшарен между markdown- и MDX-путями.

## Конвейер markdown-тела

- **`rehype-slug@6.0.0`** — каждый заголовок в `.md` / `.mdx` постах получает стабильный `id`, выведенный из текста (раньше отсутствовал — runtime-инжектор `#` производил пустой `id=""`).
- **`rehypeLazyImages`** — первый `<img>` каждого поста сохраняет `loading="eager"` + `fetchpriority="high"` (LCP escape hatch); все остальные `<img>` получают `loading="lazy"` + `decoding="async"`. Авторские escape hatches: `data-no-lazy`, класс `no-lazy`, явный `loading=…`, `data-lcp`.
- **`rehypeFigureCaption`** — `![alt](src "title")` превращает `title` в настоящий `<figcaption>` внутри оборачивающего `<figure>` (атрибут `title` стрипается с `<img>`, чтобы тот же текст не рендерился дважды — как подпись и как hover-tooltip). Привязан к `title`, а не к `alt`, по дизайну — alt-текст и подписи обслуживают разные аудитории (скринридеры vs зрячие читатели), и связывание их заставило бы авторов либо писать a11y-плохой alt, либо намеренно пустой alt, чтобы выйти из плагина. Авторские escape hatches: `data-no-caption`, класс `no-caption`, ручной `<figure>`, картинка внутри `<a>`.
- **`rehypeExternalLinks`** — внешние абсолютные URL получают `target="_blank"` + `rel="noopener noreferrer"` + визуально скрытый `<span class="sr-only"> (opens in new tab)</span>` для скринридеров (WCAG 2.1 SC 3.2.5). Внутренние / root-relative / fragment / `mailto:` / `tel:` / `javascript:` / `data:` URL пропускаются.
- **`rehypeHeadingAnchors`** — каждый h2..h6 несёт build-time `#`-permalink-потомок; заменяет прежний runtime DOM-инжектор-скрипт (у которого были FOUC, молчаливое отсутствие на per-locale `/<locale>/posts/<slug>` страницах и неработоспособность без JS). Авторские escape hatches: `data-no-heading-anchors`, класс `no-heading-anchors`, вложенность в `<a>` / `<button>`, идемпотентность.

## Навигация и читательский UX

- **Sticky right-rail table of contents** — опционально через frontmatter `tocAside: true`. `<TableOfContents>` рендерится дважды из одного источника: сворачиваемый `<details>` сверху статьи ниже `lg` и sticky right-rail `aside` (`hidden lg:block`, `position: sticky; top: 5rem;`) на `lg+`. Scrollspy через `IntersectionObserver` с `rootMargin: "0px 0px -75% 0px"`. Короткое замыкание до «не рендерить» для постов с менее чем 2 h2/h3.
- **Адаптивные таблицы** — новый Astro-компонент `<ResponsiveTable>` оборачивает слот в горизонтально-прокручиваемый контейнер с `min-w-xl` полом и edge-fade-градиентами, которые переключаются через inline-script-управляемые `data-at-start` / `data-at-end` атрибуты. `variant`-проп: `minimal` / `striped` / `striped-minimal`.
- **Рефактор кнопки «наверх»** — унифицированный frosted-pill-стиль на desktop и mobile (раньше было две визуально разные сущности — круглый FAB 56×56 на mobile, тонкая пилюля на desktop).

## SEO и ленты

- **Кастомная интеграция sitemap** (`src/integrations/sitemap.ts`) заменила `@astrojs/sitemap`. Per-URL `<lastmod>` из frontmatter `modDatetime` (с фолбэком на `pubDatetime`), резолвится через `parseDateInTz`, чтобы неоднозначные строки учитывали поле `timezone` поста. Посты вынесены в отдельный чанк `sitemap-posts-0.xml`; `<xhtml:link rel="alternate">` hreflang эмитится для каждого мульти-локального slug. Чистые хелперы вынесены в `src/utils/sitemap.ts` для юнит-тестируемости.
- **RSS-ленты** (default + per-locale `src/pages/[locale]/rss.xml.ts`) несут описание поста (frontmatter `description:` или выдержка из тела до `<!-- more -->`), с фолбэком на `config.site.description`, когда ничего из этого не присутствует.

## i18n и форматирование

- **`formatDate(date, locale, opts)`** — хелпер-обёртка над `Intl.DateTimeFormat` с мягкими фолбэками (неизвестная локаль → английская; невалидные опции → `Date#toString()`). Настраиваемый `site.dateFormat.{post,project}` в `astro-paper.config.ts`. `dayjs` больше не импортируется ни одним `.astro`-компонентом — остался только в `src/utils/parseDateInTz.ts` для timezone-_парсинга_.
- **`plural(locale, count, forms)`** — хелпер на базе `Intl.PluralRules`. `UIStrings.gallery.photoCount` — это типизированный объект `PluralForms`; русский поставляет `one` / `few` / `many` / `other`, английский и турецкий поставляют `one` + `other`.

## Операции

- **`pnpm gate`** — новый runner `scripts/gate.mjs` последовательно выполняет `pnpm test` + `pnpm lint` + `pnpm format:check` + `pnpm build` с fail-fast-семантикой и пишет один лог-файл аудита в OS temp-директорию (POSIX: `$TMPDIR/astro-paper-gate.log`; Windows: `%TEMP%\astro-paper-gate.log`; переопределяется через `ASTRO_PAPER_GATE_LOG`). Зеркалит `.github/workflows/ci.yml`.
- **25 тест-файлов**, покрывающих новую функциональную поверхность — remark/rehype-плагины, sitemap-хелперы, gallery locale-роутинг, TOC tree builder, извлечение описаний постов, правила внешних ссылок, идемпотентность heading-anchor.

## Контент-перевод

- **Footer-блок переводчика на каждом upstream-производном посте** — атрибуционная цитата с указанием [Sat Naing](https://github.com/satnaing) как оригинального автора и [Mekan Soltanov](https://github.com/msoltanov) как переводчика форка.
- **Третье лицо во всём Sat-атрибутированном контенте** — каждый upstream-переведённый пост переписан из первого лица Sat в третье, с курсивной заметкой переводчика в начале двух демо-постов.

## Благодарности

AstroPaper+ v7.0 построен поверх блестящей работы upstream AstroPaper v6.1.0 от [Sat Naing](https://github.com/satnaing) и контрибьюторов upstream. Пожалуйста, поставьте звезду upstream-проекту и [поддержите Sat на GitHub Sponsors](https://github.com/sponsors/satnaing).

См. также:

- [Как настроить тему AstroPaper+](/posts/how-to-configure-astropaper-theme/)
- [Добавление новых записей в AstroPaper+](/posts/adding-new-posts-in-astropaper-theme/)
- [Как добавить галереи в блог](/posts/how-to-add-galleries/)
- [Как добавить видео и аудио в посты блога](/posts/how-to-add-video-and-audio-in-blog-posts/)
- [Как добавить sticky right-rail table of contents](/posts/how-to-add-toc/)
- [Upstream-релиз AstroPaper v6.0 (основа этого форка)](/posts/astro-paper-v6/)
