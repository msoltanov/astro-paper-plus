---
title: "AstroPaper+ — minimal Astro blog theme (fork of AstroPaper)"
description: "A minimal, accessible, SEO-friendly Astro blog theme with multi-language support, built on top of the AstroPaper template by Sat Naing."
summary: "A minimal, accessible, SEO-friendly Astro blog theme built with Astro and Tailwind CSS, with full i18n support across English, Russian, and Turkish. Fork of AstroPaper by Sat Naing."
pubDatetime: "2026-07-03T00:00:00.000Z"
featured: true
order: 1
status: "shipped"
role: "Fork maintainer (original author: Sat Naing)"
tech:
  - Astro
  - Tailwind CSS
  - TypeScript
  - Satori
  - Pagefind
demoUrl: "/"
sourceUrl: "https://github.com/msoltanov/astro-paper-plus"
---

The **AstroPaper+** template powers this very site. AstroPaper+ is a fork of the
excellent AstroPaper theme by
[Sat Naing](https://github.com/satnaing), which adds multi-language support
(en/ru/tr) and additional quality-of-life improvements on top of the upstream
project. We are grateful to the original author and all contributors for the
solid foundation. AstroPaper+ ships with full multilingual content, dynamic OG image generation,
RSS feeds, dark mode, and Pagefind search — all with zero client-side
JavaScript.

## Highlights

- **i18n ready.** Built-in locale folder layout for posts and projects, parallel route files per locale, and a `Language` switcher that follows the user across pages. Default locale gets a clean unprefixed URL; non-default locales get `/ru/` and `/tr/`.

- **Static & fast.** Plain HTML/CSS for everything visible; small JS islands for interactive bits like the menu, theme toggle, lightbox, and Pagefind search.
- **OG images per post.** A Satori pipeline renders dynamic open-graph images at build time, so every post gets a custom card without you having to maintain assets.
- **Built on AstroPaper+.** All upstream features — Shiki transformers, callouts, back-to-top, edit-post, i18n routing, RTL support — are inherited from the original AstroPaper+.
