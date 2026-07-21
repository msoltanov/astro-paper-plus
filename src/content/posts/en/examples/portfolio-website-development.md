---
title: How Sat Naing Built His Portfolio Website & Blog
pubDatetime: "2022-03-25T16:55:12.000+00:00"
slug: how-do-i-develop-my-portfolio-and-blog
featured: false
draft: false
tags:
  - NextJS
  - TailwindCSS
  - HeadlessCMS
  - Blog
description: "EXAMPLE POST: Sat Naing's experience developing his first portfolio website and a blog using NextJS and a headless CMS."
timezone: "Asia/Yangon"
---

> **Translator note:** This post was originally written by Sat Naing in first-person voice on [satnaing.dev](https://satnaing.dev/blog/posts/how-do-i-develop-my-portfolio-and-blog). It is preserved here to demonstrate how blog posts and articles can be written using the AstroPaper+ theme, and has been adapted to third-person voice for consistency with the rest of the AstroPaper+ fork documentation.

This article was originally from Sat Naing's [blog post](https://satnaing.dev/blog/posts/how-do-i-develop-my-portfolio-and-blog). It was placed here to demonstrate how blog posts/articles can be written using the AstroPaper+ theme. The piece covers Sat Naing's experience developing his first portfolio website and a blog using NextJS and a headless CMS.

![Building portfolio](https://satnaing.dev/_ipx/w_2048,q_75/https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1653050141%2FSatNaing%2Fblog_at_cafe_ei1wf4.jpg?url=https%3A%2F%2Fres.cloudinary.com%2Fnoezectz%2Fimage%2Fupload%2Fv1653050141%2FSatNaing%2Fblog_at_cafe_ei1wf4.jpg&w=2048&q=75)

## Motivation

Sat Naing had been thinking about launching his own website with a custom domain name (**satnaing.dev**) since his college student life. But it never happened until this project. Sat Naing had done several projects and works about web application development but hadn't made an effort to do this. So, "what about blog?" you may ask. Yeah, blog had also been in Sat's project list for some time. He had always wanted to make a blog project using some of the latest technologies. However, Sat Naing had been busy with his work and other projects, so the blog project had never been started.

These days, Sat tends to develop his own projects with a focus on good quality rather than quantity. After a project is done, Sat usually puts a proper README file in the GitHub repo. But a GitHub repo README is only suitable for technical aspects (in his opinion). Sat wanted to write down his experiences and challenges. Thus, he decided to make his own blog. Plus, at that point, Sat Naing had enough experience and confidence to develop this project.

## Tech Stack

For the front-end, Sat Naing wanted to use [React](https://reactjs.org/ "React Official Website"). But React alone is not good enough for SEO; and there were many factors to consider like routing, image optimization, etc. So, Sat chose [NextJS](https://nextjs.org/ "NextJS Official Website") as the main front-end stack. And of course TypeScript for type checking. (They say you will love TypeScript when you get used to it ??)

For styling, Sat uses [TailwindCSS](https://tailwindcss.com/ "Tailwind CSS Official Website"). The reason is that Sat likes the developer experience Tailwind provides, and it offers far more flexibility compared to other UI component libraries like MUI or React Bootstrap.

All the content of this project lives in a GitHub repository. All blog posts (including this one) are written in Markdown format, since Sat is accustomed to it. To write Markdown with frontmatter without friction, Sat uses [Forestry](https://forestry.io/ "Forestry Official Website") headless CMS. It's a git-based CMS that delivers Markdown and other content. Thanks to this, content can be written in either Markdown or in the WYSIWYG editor. Plus, writing frontmatter with it is a pleasure.

Images and assets are uploaded and stored in [Cloudinary](https://cloudinary.com/ "Cloudinary Official Website"). Cloudinary is connected via Forestry and managed straight from the dashboard.

Here's the stack used for this project:

- Frontend: NextJS (TypeScript)
- Styling: TailwindCSS
- Animations: GSAP
- CMS: Forestry Headless CMS
- Deployment: Vercel

## Features

The following are certain features of this portfolio and blog.

### SEO Friendly

The entire project is developed with SEO focus in mind. Sat Naing has used proper meta tags, descriptions, and heading alignments. This website is now indexed by Google.

> You can search this website on Google by using keywords like 'sat naing dev'

![searching satnaing.dev on google](https://res.cloudinary.com/noezectz/image/upload/v1648231400/SatNaing/satnaing-on-google_asflq6.png "satnaing.dev is indexed")

Moreover, this website will be displayed well when shared on social media due to properly used meta tags.

![satnaing.dev card layout when shared to Facebook](https://res.cloudinary.com/noezectz/image/upload/v1653106955/SatNaing/satnaing-dev-share-on-facebook_1_zjoehx.png "Card layout when shared to Facebook")

### Dynamic Sitemap

Sitemap plays an important part in SEO. Because of this, every single page of this site should be included in sitemap.xml. Sat Naing built an auto-generated sitemap that updates whenever a new piece of content, tag, or category is created.

### Light & Dark Themes

Due to the dark theme trend in recent years, many websites include a dark theme out of the box nowadays. Certainly, this website supports light and dark themes.

### Fully Accessible

This website is fully accessible. You can navigate around using only a keyboard. Sat Naing followed all a11y enhancement best practices: alt text on every image, no skipping heading levels, semantic HTML tags, and proper aria attributes.

### Search Box, Categories & Tags

All blog content can be searched via the search box. Moreover, content can be filtered by categories and tags. In this way, blog readers can search and read what they really want.

### Performance and Lighthouse Score

This website achieved very good performance and Lighthouse scores thanks to proper development and best practices. Here's the Lighthouse score for this website:

![satnaing.dev Lighthouse score](https://user-images.githubusercontent.com/53733092/159957822-7082e459-11e9-4616-8f1e-49d0881f7cbb.png "Lighthouse score")

### Animations

At first, Sat Naing used [Framer Motion](https://www.framer.com/motion/ "Framer Motion") for animations and micro-interactions. However, when trying to use complex animations and parallax effects, integrating them with Framer Motion was awkward (perhaps Sat just wasn't used to working with it). So, Sat decided to switch to [GSAP](https://greensock.com/ "GSAP Animation Library") for all animations. It's one of the most popular animation libraries, capable of complex and advanced effects. Animations and micro-interactions can be seen on practically every page of the site.

![Animations on satnaing.dev](https://res.cloudinary.com/noezectz/image/upload/v1653108324/SatNaing/ezgif.com-gif-maker_2_hehtlm.gif "satnaing.dev website")

## Outro

In the end, this project gave Sat Naing a lot of experience and confidence in developing blog sites (SSG). He gained knowledge about git-based CMS and how it interacts with NextJS. Sat also learned about SEO, dynamic sitemap generation, and Google indexing procedures. In the future, Sat Naing plans to build even more interesting projects. So stay tuned! ???

Last but not least, Sat Naing would like to say "thank you" to his friend [Swann Fevian Kyaw](https://www.facebook.com/bon.zai.3910 "Swann Fevian Kyaw Facebook account") ([@ToonHa](https://www.facebook.com/ToonHa-102639465752883 "ToonHa Facebook page")), who drew the beautiful illustration for the hero section of the site.

## Project Links

- Website: [https://satnaing.dev/](https://satnaing.dev/ "https://satnaing.dev/")
- Blog: [https://satnaing.dev/blog](https://satnaing.dev/blog "https://satnaing.dev/blog")
- Repo: [https://github.com/satnaing/my-portfolio](https://github.com/satnaing/my-portfolio "https://github.com/satnaing/my-portfolio")

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
