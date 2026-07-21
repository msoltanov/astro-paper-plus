---
title: Как Sat Naing разработал своё портфолио-сайт в виде терминала на React
pubDatetime: "2022-06-09T03:42:51Z"
featured: false
draft: false
tags:
  - JavaScript
  - ReactJS
  - ContextAPI
  - Styled-Components
  - TypeScript
description: "ПРИМЕР ЗАПИСИ: Разработка сайта в стиле терминала на ReactJS, TypeScript и Styled-Components. С возможностями автодополнения, нескольких тем, подсказок команд и т.д."
timezone: "Asia/Yangon"
---

> **Заметка переводчика:** Этот пост изначально написан Sat Naing от первого лица в [satnaing.dev](https://satnaing.dev/blog/posts/how-do-i-develop-my-terminal-portfolio-website-with-react). Он сохранён здесь, чтобы показать, как можно писать посты и статьи в теме AstroPaper+, и адаптирован к третьему лицу для единообразия с остальной документацией форка AstroPaper+.

Эта статья изначально опубликована в [блоге Sat Naing](https://satnaing.dev/blog/posts/how-do-i-develop-my-terminal-portfolio-website-with-react). Она размещена здесь, чтобы показать, как можно писать посты/статьи в теме AstroPaper+. Материал посвящён разработке сайта в стиле терминала на ReactJS, TypeScript и Styled-Components — с возможностями автодополнения, нескольких тем, подсказок команд и т.д.

![Портфолио-терминал Sat Naing](https://satnaing.dev/_ipx/w_2048,q_75/https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1654754125%2FSatNaing%2Fterminal-screenshot_gu3kkc.png?url=https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1654754125%2FSatNaing%2Fterminal-screenshot_gu3kkc.png&w=2048&q=75)

## Table of contents

## Введение

Недавно Sat Naing разработал и опубликовал своё портфолио плюс блог. Он был рад получить хорошие отзывы. Сегодня Sat представляет свой новый портфолио-сайт в стиле терминала. Он разработан на ReactJS и TypeScript. Идея была взята с CodePen и YouTube.

## Стек технологий

Этот проект — фронтенд без какого-либо бэкенда. UI/UX часть разработана в Figma. Для фронтенда Sat Naing выбрал React вместо чистого JavaScript и NextJS. Почему?

- Во-первых, Sat хотел писать декларативный код. Управлять HTML DOM императивно через JavaScript очень муторно.
- Во-вторых, потому что это React!!! Он быстрый и надёжный.
- Наконец, Sat Naing не нуждался в большинстве SEO-возможностей, маршрутизации и оптимизации изображений, которые предоставляет NextJS.

И конечно же TypeScript для проверки типов. Для стилизации Sat Naing выбрал другой подход, чем обычно. Вместо чистого CSS, Sass или утилитарного CSS-фреймворка вроде TailwindCSS Sat выбрал путь CSS-in-JS (Styled-Components). Хотя Sat Naing давно знал про Styled-Components, он никогда их не пробовал. Так что стиль и структура Styled-Components в этом проекте могут быть не самыми организованными.

Этот проект не требует сложного управления состоянием. Sat Naing просто использует ContextAPI для поддержки нескольких тем и чтобы избежать prop drilling. Вот краткая сводка по стеку:

- Frontend: [ReactJS](https://reactjs.org/ "Сайт React"), [TypeScript](https://www.typescriptlang.org/ "Сайт TypeScript")
- Стилизация: [Styled-Components](https://styled-components.com/ "Сайт Styled-Components")
- UI/UX: [Figma](https://figma.com/ "Сайт Figma")
- Управление состоянием: [ContextAPI](https://reactjs.org/docs/context.html "React ContextAPI")
- Деплой: [Netlify](https://www.netlify.com/ "Сайт Netlify")

## Возможности

Вот некоторые особенности проекта.

### Несколько тем

Пользователи могут переключаться между несколькими темами. На момент написания этого поста тем 5; вероятно, в будущем будут добавлены ещё. Выбранная тема сохраняется в local storage, чтобы тема не сбрасывалась при перезагрузке страницы.

![Установка разных тем](https://i.ibb.co/fSTCnWB/terminal-portfolio-multiple-themes.gif)

### Автодополнение команд

Чтобы выглядеть и ощущаться как можно ближе к настоящему терминалу, Sat Naing добавил автодополнение команд, которое автоматически дописывает частично введённые команды по нажатию `Tab` или `Ctrl + i`.

![Демонстрация автодополнения команд](https://i.ibb.co/CQTGGLF/terminal-autocomplete.gif)

### Предыдущие команды

Пользователи могут возвращаться к предыдущим командам или перемещаться по ранее введённым с помощью стрелок `Вверх` и `Вниз`.

![Возврат к предыдущим командам стрелкой Вверх](https://i.ibb.co/vD1pSRv/terminal-up-down.gif)

### Просмотр/очистка истории команд

Ранее введённые команды можно посмотреть, набрав `history` в командной строке. Всю историю команд и экран терминала можно очистить, набрав `clear` или нажав `Ctrl + l`.

![Очистка терминала командой 'clear' или 'Ctrl + L'](https://i.ibb.co/SJBy8Rr/terminal-clear.gif)

## Заключение

Это очень весёлый проект, и его особенная черта в том, что Sat Naing пришлось сосредоточиться на логике, а не на пользовательском интерфейсе (хотя это в каком-то смысле фронтенд-проект).

## Ссылки на проект

- Сайт: [https://terminal.satnaing.dev/](https://terminal.satnaing.dev/ "https://terminal.satnaing.dev/")
- Репозиторий: [https://github.com/satnaing/terminal-portfolio](https://github.com/satnaing/terminal-portfolio "https://github.com/satnaing/terminal-portfolio")

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
