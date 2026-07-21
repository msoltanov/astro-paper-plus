---
title: Как Sat Naing разработал свой сайт-портфолио и блог
pubDatetime: "2022-03-25T16:55:12.000+00:00"
featured: false
draft: false
tags:
  - NextJS
  - TailwindCSS
  - HeadlessCMS
  - Blog
description: "ПРИМЕР ЗАПИСИ: Опыт Sat Naing в разработке первого сайта-портфолио и блога на NextJS и headless CMS."
timezone: "Asia/Yangon"
---

> **Заметка переводчика:** Этот пост изначально написан Sat Naing от первого лица в [satnaing.dev](https://satnaing.dev/blog/posts/how-do-i-develop-my-portfolio-and-blog). Он сохранён здесь, чтобы показать, как можно писать посты и статьи в теме AstroPaper+, и адаптирован к третьему лицу для единообразия с остальной документацией форка AstroPaper+.

Эта статья изначально опубликована в [блоге Sat Naing](https://satnaing.dev/blog/posts/how-do-i-develop-my-portfolio-and-blog). Она размещена здесь, чтобы показать, как можно писать посты/статьи в теме AstroPaper+. Материал посвящён опыту Sat Naing в разработке первого сайта-портфолио и блога на NextJS и headless CMS.

![Создание портфолио](https://satnaing.dev/_ipx/w_2048,q_75/https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1653050141%2FSatNaing%2Fblog_at_cafe_ei1wf4.jpg?url=https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1653050141%2FSatNaing%2Fblog_at_cafe_ei1wf4.jpg&w=2048&q=75)

## Мотивация

Sat Naing давно думал о запуске собственного сайта с собственным доменным именем (**satnaing.dev**) ещё со студенческих лет. Но так и не случилось до этого проекта. Sat Naing делал несколько проектов и работ по веб-разработке, но не прилагал усилий, чтобы это сделать. Так, «а что насчёт блога?» — спросите вы. Да, блог тоже давно был в списке проектов Sat Naing. Он всегда хотел сделать блог-проект с использованием новейших технологий. Однако Sat Naing был занят своими работами и другими проектами, так что блог-проект так и не начался.

В последнее время Sat Naing предпочитает разрабатывать собственные проекты с фокусом на качество, а не на количество. После завершения проекта Sat Naing обычно кладёт в GitHub-репозиторий приличный README. Но README подходит только для технических аспектов (по мнению Sat Naing). Sat Naing хотел записать свой опыт и вызовы. Поэтому он решил сделать свой блог. К тому же на тот момент у Sat Naing было достаточно опыта и уверенности, чтобы взяться за этот проект.

## Стек технологий

Для фронтенда Sat Naing хотел использовать [React](https://reactjs.org/ "Официальный сайт React"). Но React сам по себе недостаточен для SEO; пришлось учитывать много факторов вроде маршрутизации, оптимизации изображений и т.д. Поэтому Sat Naing выбрал [NextJS](https://nextjs.org/ "Официальный сайт NextJS") в качестве основного фронтенд-стека. И конечно TypeScript для проверки типов. (Говорят, что вы полюбите TypeScript, когда привыкнете к нему ??)

Для стилизации Sat Naing использует [TailwindCSS](https://tailwindcss.com/ "Официальный сайт Tailwind CSS"). Это потому, что Sat Naing нравится опыт разработки, который даёт Tailwind, и у него гораздо больше гибкости по сравнению с другими UI-библиотеками компонентов вроде MUI или React Bootstrap.

Весь контент этого проекта лежит в GitHub-репозитории. Все посты блога (включая этот) написаны в формате Markdown, поскольку Sat Naing к нему привык. Чтобы писать Markdown с frontmatter без лишних усилий, Sat Naing использует [Forestry](https://forestry.io/ "Официальный сайт Forestry") headless CMS. Это git-based CMS, который отдаёт Markdown и другой контент. Благодаря этому контент можно писать как в Markdown, так и в WYSIWYG-редакторе. Кроме того, писать frontmatter с ним — одно удовольствие.

Изображения и ассеты загружаются и хранятся в [Cloudinary](https://cloudinary.com/ "Официальный сайт Cloudinary"). Cloudinary подключён через Forestry и управляется прямо из дашборда.

В итоге вот стек, который использовался для этого проекта:

- Frontend: NextJS (TypeScript)
- Стилизация: TailwindCSS
- Анимации: GSAP
- CMS: Forestry Headless CMS
- Деплой: Vercel

## Возможности

Ниже — некоторые особенности этого портфолио и блога.

### SEO-дружественность

Весь проект разработан с фокусом на SEO. Sat Naing использовал правильные мета-теги, описания и иерархию заголовков. Сейчас сайт индексируется Google.

> Найти этот сайт в Google можно по запросам вроде 'sat naing dev'

![Поиск satnaing.dev в Google](https://res.cloudinary.com/noezectz/image/upload/v1648231400/SatNaing/satnaing-on-google_asflq6.png "satnaing.dev проиндексирован")

Кроме того, сайт хорошо выглядит при шеринге в соцсетях благодаря правильно расставленным мета-тегам.

![Как выглядит карточка satnaing.dev при шеринге в Facebook](https://res.cloudinary.com/noezectz/image/upload/v1653106955/SatNaing/satnaing-dev-share-on-facebook_1_zjoehx.png "Карточка при шеринге в Facebook")

### Динамический sitemap

Sitemap играет важную роль в SEO. Поэтому каждая страница сайта должна быть включена в sitemap.xml. Sat Naing сделал автогенерируемый sitemap, который обновляется при создании нового контента, тегов или категорий.

### Светлая и тёмная темы

Благодаря тренду на тёмные темы в последние годы многие сайты включают тёмную тему «из коробки». Этот сайт тоже поддерживает светлую и тёмную темы.

### Полная доступность

Сайт полностью доступен. По нему можно перемещаться только с клавиатуры. Sat Naing применил лучшие практики a11y: alt-тексты у всех изображений, заголовки без пропусков, семантические HTML-теги, корректное использование aria-атрибутов.

### Поиск, категории и теги

Весь контент блога можно искать через поисковую строку. Кроме того, контент можно фильтровать по категориям и тегам. Так читатели могут искать и читать именно то, что хотят.

### Производительность и Lighthouse

Сайт получил очень хорошие показатели производительности и Lighthouse благодаря правильной разработке и лучшим практикам. Вот показатели Lighthouse для этого сайта:

![Lighthouse satnaing.dev](https://user-images.githubusercontent.com/53733092/159957822-7082e459-11e9-4616-8f1e-49d0881f7cbb.png "Lighthouse satnaing.dev")

### Анимации

Сначала Sat Naing использовал [Framer Motion](https://www.framer.com/motion/ "Framer Motion") для анимаций и микровзаимодействий. Однако при попытке использовать сложные анимации и параллакс-эффекты интегрировать их с Framer Motion было неудобно (возможно, Sat Naing просто не привык с ним работать). Поэтому Sat Naing решил перейти на [GSAP](https://greensock.com/ "GSAP Animation Library") для всех анимаций. Это одна из самых популярных библиотек анимаций, способная на сложные и продвинутые эффекты. Анимации и микровзаимодействия можно увидеть практически на каждой странице сайта.

![Анимации на satnaing.dev](https://res.cloudinary.com/noezectz/image/upload/v1653108324/SatNaing/ezgif.com-gif-maker_2_hehtlm.gif "satnaing.dev website")

## Заключение

В итоге этот проект дал Sat Naing много опыта и уверенности в разработке сайтов блога (SSG). Sat Naing получил знания о git-based CMS и о том, как она взаимодействует с NextJS. Также Sat Naing научился SEO, генерации динамического sitemap и процедурам индексирования Google. В будущем Sat Naing планирует сделать ещё более интересные проекты. Так что оставайтесь на связи! ???

И... последнее, но не менее важное: Sat Naing хотел бы сказать «спасибо» своему другу [Сванну Февиану Кио](https://www.facebook.com/bon.zai.3910 "Аккаунт Swann Fevian Kyaw в Facebook") ([@ToonHa](https://www.facebook.com/ToonHa-102639465752883 "Страница ToonHa в Facebook")), который нарисовал прекрасную иллюстрацию для hero-секции сайта.

## Ссылки на проект

- Сайт: [https://satnaing.dev/](https://satnaing.dev/ "https://satnaing.dev/")
- Блог: [https://satnaing.dev/blog](https://satnaing.dev/blog "https://satnaing.dev/blog")
- Репозиторий: [https://github.com/satnaing/my-portfolio](https://github.com/satnaing/my-portfolio "https://github.com/satnaing/my-portfolio")

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
