---
title: How Sat Naing Built His Terminal Portfolio Website with React
pubDatetime: "2022-06-09T03:42:51Z"
slug: how-do-i-develop-my-terminal-portfolio-website-with-react
featured: false
draft: false
tags:
  - JavaScript
  - ReactJS
  - ContextAPI
  - Styled-Components
  - TypeScript
description: "EXAMPLE POST: Developing a terminal-like website using ReactJS, TypeScript and Styled-Components. Includes features like autocomplete, multiple themes, command hints etc."
timezone: "Asia/Yangon"
---

> **Translator note:** This post was originally written by Sat Naing in first-person voice on [satnaing.dev](https://satnaing.dev/blog/posts/how-do-i-develop-my-terminal-portfolio-website-with-react). It is preserved here to demonstrate how blog posts and articles can be written using the AstroPaper+ theme, and has been adapted to third-person voice for consistency with the rest of the AstroPaper+ fork documentation.

This article was originally from Sat Naing's [blog post](https://satnaing.dev/blog/posts/how-do-i-develop-my-terminal-portfolio-website-with-react). It was placed here to demonstrate how blog posts/articles can be written using the AstroPaper+ theme. The piece covers developing a terminal-like website using ReactJS, TypeScript and Styled-Components, including features like autocomplete, multiple themes, command hints, and more.

![Sat Naing's Terminal Portfolio](https://satnaing.dev/_ipx/w_2048,q_75/https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1654754125%2FSatNaing%2Fterminal-screenshot_gu3kkc.png?url=https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1654754125%2FSatNaing%2Fterminal-screenshot_gu3kkc.png&w=2048&q=75)

## Table of contents

## Intro

Recently, Sat Naing developed and published his portfolio and a blog. He was glad to receive some good feedback for it. Today, Sat introduces his new terminal-like portfolio website. It is developed using ReactJS and TypeScript. The idea came from CodePen and YouTube.

## Tech Stack

This project is a frontend project without any backend code. The UI/UX part is designed in Figma. For the frontend user-interface, Sat chose React over plain JavaScript and NextJS. Why?

- Firstly, Sat wanted to write declarative code. Managing the HTML DOM using JavaScript imperatively is really tedious.
- Secondly, because it is React!!! It is fast, and reliable.
- Lastly, Sat didn't need much of the SEO features, routing, and image optimization provided by NextJS.

And of course there's TypeScript for type checking. For styling, Sat took a different approach than what he usually does. Instead of choosing Pure CSS, Sass, or a Utility CSS Framework like TailwindCSS, Sat chose the CSS-in-JS way (Styled-Components). Although Sat had known about Styled-Components for some time, he had never tried them out. So, the writing style and structure of Styled-Components in this project may not be very organized or very good.

This project doesn't need very complex state management. Sat simply uses ContextAPI for multiple theming and to avoid prop drilling. Here's a quick recap of the tech stack.

- Frontend: [ReactJS](https://reactjs.org/ "React Website"), [TypeScript](https://www.typescriptlang.org/ "TypeScript Website")
- Styling: [Styled-Components](https://styled-components.com/ "Styled-Components Website")
- UI/UX: [Figma](https://figma.com/ "Figma Website")
- State Management: [ContextAPI](https://reactjs.org/docs/context.html "React ContextAPI")
- Deployment: [Netlify](https://www.netlify.com/ "Netlify Website")

## Features

Here are some features of the project.

### Multiple Themes

Users can switch between multiple themes. At the time of writing this post, there are 5 themes; and more themes will probably be added in the future. The selected theme is saved in local storage so that the theme won't change on page refresh.

![Setting different themes](https://i.ibb.co/fSTCnWB/terminal-portfolio-multiple-themes.gif)

### Command-line Completion

To look and feel as close to the actual terminal as possible, Sat added a command-line completion feature which auto-fills partially typed commands by simply pressing `Tab` or `Ctrl + i`.

![Demonstrating command-line completion](https://i.ibb.co/CQTGGLF/terminal-autocomplete.gif)

### Previous Commands

Users can go back to previous commands or navigate previously typed commands by pressing the Up and Down arrows.

![Going back to previous commands with the UP arrow](https://i.ibb.co/vD1pSRv/terminal-up-down.gif)

### View/Clear Command History

Previously typed commands can be viewed by typing `history` in the command line. All command history and the terminal screen can be wiped out by typing `clear` or pressing `Ctrl + l`.

![Clearing the terminal with 'clear' or 'Ctrl + L' command](https://i.ibb.co/SJBy8Rr/terminal-clear.gif)

## Outro

This is a really fun project, and one special part of it is that Sat had to focus on logic rather than user-interface (even though this is kind of a frontend project).

## Project Links

- Website: [https://terminal.satnaing.dev/](https://terminal.satnaing.dev/ "https://terminal.satnaing.dev/")
- Repo: [https://github.com/satnaing/terminal-portfolio](https://github.com/satnaing/terminal-portfolio "https://github.com/satnaing/terminal-portfolio")

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
