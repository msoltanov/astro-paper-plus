# AstroPaper+ 📄 (v7)

> A minimal, responsive, accessible and SEO-friendly Astro blog theme — with multi-language content built in.
>
> **AstroPaper+** is a fork of the original [AstroPaper](https://github.com/satnaing/astro-paper) by [Sat Naing](https://github.com/satnaing). See [Attribution](#-attribution) below.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![GitHub](https://img.shields.io/github/license/msoltanov/astro-paper-plus?color=%232F3741&style=for-the-badge)

AstroPaper+ v7 is a minimal, responsive, accessible and SEO-friendly Astro blog theme, designed and crafted with multi-language content in mind (English, Russian, Turkish). Read [the blog posts](https://github.com/msoltanov/astro-paper-plus) or check [the Documentation section](#-documentation) below for more info.

## ✨ What's different from upstream AstroPaper

AstroPaper+ inherits every feature of upstream [AstroPaper](https://github.com/satnaing/astro-paper) (originally AstroPaper v6.1.0) and adds:

- **Multi-language content (en / ru / tr).** Locale-scoped `src/content/posts/<locale>/` folders, parallel route files per locale, and a Language switcher in the header.
- **i18n string layer.** All UI strings are extracted to `src/i18n/lang/<locale>.ts` with a typed `UIStrings` contract — adding a new language is one file. CLDR-correct pluralization (`Intl.PluralRules` + `plural()` helper, full one/few/many/other set for Russian), and a configurable date display format (`site.dateFormat` → `Intl.DateTimeFormatOptions`) that picks up locale-specific CLDR overrides automatically.
- **Per-locale page, post, project and RSS routes** generated automatically via Astro's i18n.
- **Image galleries** (opt-in via `features.enableGalleries`): PhotoSwipe v5 lightbox, locale-scoped collections, responsive grid. Off by default.
- **Video & audio embeds**: YouTube, Vimeo, Loom, Bilibili, Twitch, SoundCloud, Spotify + native media via a single remark plugin.
- **Sticky right-rail table of contents** for long-form posts (per-post opt-in via frontmatter).
- **Quality-of-life fixes** cherry-picked on top of upstream AstroPaper v6.1.0.

## 🔥 Features

- [x] type-safe markdown
- [x] super fast performance
- [x] accessible (Keyboard / VoiceOver / TalkBack)
- [x] responsive (mobile → desktops)
- [x] SEO-friendly
- [x] light & dark mode
- [x] static search ([Pagefind](https://pagefind.app/))
- [x] draft posts & pagination
- [x] sitemap & RSS feed
- [x] MDX support
- [x] collapsible table of contents
- [x] followed best practices
- [x] highly customizable
- [x] dynamic OG image generation for blog posts
- [x] i18n ready (en / ru / tr)
- [x] callouts (Obsidian-style via `rehype-callouts`)

> Accessibility for AstroPaper+ was tested with **VoiceOver** on macOS and **TalkBack** on Android against the upstream baseline. The fork does not regress on these.

### Opt-in features

These aren't bundled by default — enabling them adds global bytes to every page, which conflicts with the "minimal" theme promise. Follow the how-to guides to add them to your fork if you need them.

- **LaTeX equations (KaTeX)** — `remark-math` + `rehype-katex`. Adds ~50KB gzipped of global CSS. See [the how-to guide](src/content/posts/en/how-to-add-latex-equations-in-blog-posts.md).

## 🚀 Project Structure

```bash
/
├── public/
│   ├── pagefind/         # auto-generated on build
│   ├── favicon.svg
│   └── default-og.jpg
├── src/
│   ├── assets/
│   │   ├── icons/
│   │   └── images/
│   ├── components/
│   ├── content/
│   │   ├── pages/        # about.md and other standalone pages
│   │   └── posts/        # blog posts, organised by locale subfolder
│   ├── i18n/             # language strings (en / ru / tr)
│   ├── layouts/
│   ├── pages/
│   ├── scripts/
│   ├── styles/
│   ├── types/
│   ├── utils/
│   ├── config.ts
│   └── content.config.ts
├── astro-paper.config.ts # user-defined configuration
└── astro.config.ts
```

All blog posts live in `src/content/posts/`. Subdirectories are locale tags (`en/`, `ru/`, `tr/`); posts at the root use the default locale (English).

## 📖 Documentation

Documentation can be read in two formats — _markdown_ & _blog post_.

- Configuration — [markdown](src/content/posts/en/how-to-configure-astropaper-theme.mdx) | [blog post](/posts/how-to-configure-astropaper-theme/)
- Add Posts — [markdown](src/content/posts/en/adding-new-post.mdx) | [blog post](/posts/adding-new-posts-in-astropaper-theme/)
- Customize Color Schemes — [markdown](src/content/posts/en/_color-schemes/predefined-color-schemes.mdx) | [blog post](/posts/predefined-color-schemes/)

## 💻 Tech Stack

| Layer             | Choice                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main Framework    | [Astro](https://astro.build/)                                                                                                                     |
| Type Checking     | [TypeScript](https://www.typescriptlang.org/)                                                                                                     |
| Styling           | [TailwindCSS](https://tailwindcss.com/)                                                                                                           |
| UI/UX             | [Figma Design File](https://www.figma.com/community/file/1356898632249991861)                                                                     |
| Static Search     | [Pagefind](https://pagefind.app/)                                                                                                                 |
| Icons             | [Tablers](https://tabler-icons.io/)                                                                                                               |
| Code Formatting   | [Prettier](https://prettier.io/)                                                                                                                  |
| Linting           | [ESLint](https://eslint.org)                                                                                                                      |
| Dynamic OG images | [Satori](https://github.com/vercel/satori) + [Sharp](https://sharp.pixelplumbing.com/) + [Astro Fonts](https://docs.astro.build/en/guides/fonts/) |

## 👨🏻‍💻 Running Locally

```bash
# Clone the fork
git clone https://github.com/msoltanov/astro-paper-plus.git
cd astro-paper-plus

# Install dependencies
pnpm install

# Start the dev server
pnpm dev
```

To scaffold from the upstream template instead and then layer the i18n / fork changes on top:

```bash
# Original upstream template
pnpm create astro@latest --template satnaing/astro-paper
```

Then run `pnpm install` and `pnpm dev`.

### Google Site Verification (optional)

Add a [Google Site Verification HTML tag](https://support.google.com/webmasters/answer/9008080#meta_tag_verification&zippy=%2Chtml-tag) by setting `site.googleVerification` in `astro-paper.config.ts` (see [`docs/env.md`](docs/env.md) for the full env-var schema and the env-var fallback chain).

## 🔒 Content Trust Boundary

AstroPaper+ assumes **single-author / trusted-content** for Markdown and MDX posts. Raw HTML and inline JSX pass through the build pipeline untouched, so any author with commit access can ship arbitrary script to your readers' browsers. This is the same trust model as a developer editing a hand-written React/JSX component — it's safe **if** you control the author set.

What the theme **does not** do, by design:

- `rehype-sanitize` is **not** enabled. Enabling it would strip the features the theme ships — Mermaid `<pre class="mermaid">` blocks become inert, `rehype-figure-caption` wraps break, the `remarkEmbeds` providers (YouTube, Vimeo, etc.) lose their iframes, and authors can no longer paste HTML figures or shortcode-style elements.
- No CSP nonce. The `script-src` is a strict per-script `sha256-…` allowlist computed at build time (`_headers` / `dist/nginx-headers.conf`); see `astro.config.ts:collectInlineScriptHashes` for the implementation.

If you accept content from **multiple authors who don't all have commit access** (e.g. a guest-post submission flow, a CMS, or PRs from untrusted contributors), turn on `rehype-sanitize` in `astro.config.ts` and expect to whitelist specific elements/attributes the theme relies on. The Mermaid + figure-caption + embeds pipeline will need adapter updates; treat that as a separate hardening pass.

For most blogs (single maintainer or a small trusted team), the default trust boundary is fine — just don't accept Markdown from strangers without code review.

## 🛡️ Secret scanning

`pnpm secret:scan` runs [gitleaks](https://github.com/gitleaks/gitleaks) over both the git history and the working tree. The wrapper script (`scripts/secret-scan.mjs`) downloads gitleaks on first run and caches the binary in `.cache/gitleaks/` (gitignored), so no system-wide install is required. CI runs the same command on every push and PR; see the `secrets` job in `.github/workflows/ci.yml`. The project's allowlist (`.gitleaks.toml`) excludes the build/cache directories (`dist/`, `.astro/`, `node_modules/`, `public/pagefind/`, `coverage/`, `.cache/`, `.legacy-i18n-cleanup/`) plus the generated `dist/_headers` and `dist/nginx-headers.conf` to avoid false positives on the build's own output.

Pass `GITLEAKS_ARGS=--no-git` to scan only the working tree (skipping history), or set it to any other gitleaks flag — the wrapper appends the value to the underlying `gitleaks detect` invocation.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command            | Action                                                                                                                           |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`     | Installs dependencies                                                                                                            |
| `pnpm dev`         | Starts local dev server at `localhost:4321`                                                                                      |
| `pnpm build`       | Type-checks, builds the site, runs Pagefind indexing, copies the index to `public/pagefind/`                                     |
| `pnpm preview`     | Preview your build locally, before deploying                                                                                     |
| `pnpm sync`        | Generates TypeScript types for all Astro modules. [Learn more](https://docs.astro.build/en/reference/cli-reference/#astro-sync). |
| `pnpm secret:scan` | Runs gitleaks over git history + working tree. See the 🛡️ section below.                                                         |
| `pnpm astro ...`   | Run CLI commands like `astro add`, `astro check`                                                                                 |
| `pnpm test`        | Runs the Vitest suite                                                                                                            |

## ✨ Feedback & Suggestions

Found a bug 🐛 or have an improvement ✨ for the fork? Open an [issue](https://github.com/msoltanov/astro-paper-plus/issues) or a [pull request](https://github.com/msoltanov/astro-paper-plus/pulls) on this fork.

For upstream AstroPaper, please direct feedback to [the upstream issues](https://github.com/satnaing/astro-paper/issues) and [discussions](https://github.com/satnaing/astro-paper/discussions).

## 🙏 Attribution

AstroPaper+ is built on top of the upstream project **[AstroPaper](https://github.com/satnaing/astro-paper)** by **[Sat Naing](https://github.com/satnaing)**. The original theme is licensed under MIT — please consider starring the upstream repo and supporting the original author via [GitHub Sponsors](https://github.com/sponsors/satnaing) or [Buy Me a Coffee](https://buymeacoffee.com/satnaing).

## 📜 License

Licensed under the MIT License.

- Copyright © 2026 Mekan Soltanov (AstroPaper+ fork additions)

See [LICENSE](LICENSE) for the full text.

---

Fork maintained by [@msoltanov](https://github.com/msoltanov).
