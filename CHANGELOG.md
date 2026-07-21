# Changelog

## 7.0.0 - 2026-07-13

### Added

- AstroPaper+ branding, Astro 7, and Tailwind CSS 4 setup.
- Multi-language i18n (English, Russian, Turkish) with per-locale routes.
- Typed `UIStrings` contract with CLDR pluralization and locale-aware date formatting.
- Locale switcher component and per-locale RSS feeds.
- Project and gallery content collections with optional PhotoSwipe lightbox.
- Pagefind search engine integration.
- Dynamic Open Graph images via Satori and Sharp.
- Custom sitemap integration (per-post `<lastmod>`, `hreflang` alternates, chunked output).
- Shared Markdown and MDX remark/rehype pipeline.
- Markdown features: video/audio embeds (7 providers), Obsidian-style callouts, figure captions, lazy images with LCP awareness, heading anchors, optional table of contents, retina screenshot detection, Mermaid diagram support.
- Responsive table styling with edge-fade gradients.
- `pnpm gate` local CI mirror (13-step fail-fast chain: format, lint, typecheck, coverage, content guard, security check, build, CSP allowlist, nginx headers, OG check, audit, secret scan).
- Secret scanning script (cross-platform gitleaks wrapper with binary caching).
- Production dependency audit via osv.dev bulk API.
- Content trust boundary enforcement scripts (`check-md-script.mjs`, `check-iframe-allowlist.mjs`).
- Security posture verification script (`check-security.mjs`).
- Docker nginx headers integration test.
- Docker image digest pinning and drift-check CI workflow.
- Gitleaks automated version-bump workflow.
- ESLint TypeScript recommended rules on `*.ts`/`*.tsx` files.
- 36 jsx-a11y accessibility rules on `.astro` files.
- Structured data JSON-LD: `WebSite` + `SearchAction` on every page, `BreadcrumbList` on nested pages, `Article` on post detail.
- HTML `hreflang` clusters on all static routes (home, about, posts index, projects index, galleries index, tags index, archives) and their locale twins.
- Git pre-commit hook (format + lint + secret scan on working tree).
- GitHub CI: composite pnpm setup action, issue templates, PR template, Dependabot config.
- Environment variable documentation (`docs/env.md`).
- Project lessons record (`tasks/lessons.md`).

### Changed

- Active locales limited to `en`, `ru`, and `tr`; Turkmen removed.
- Web font output reduced to WOFF2 only (978 KB → 73 KB).
- Shared `HomePage.astro` and `PostsIndexBody.astro` between default-locale and prefixed routes.
- Coverage thresholds raised to 80/70/80/78 (lines/branches/functions/statements).
- `pnpm gate` expanded from 7 to 13 steps.
- Env schema: `GOOGLE_SITE_VERIFICATION` moved to `context: "server"`, dropped misdirecting `PUBLIC_` prefix.
- `_headers` CSP: removed `i.ytimg.com`, `vimeocdn.com`, and `connect-src`; added `form-action 'self'`.

### Removed

- Turkmen as an active locale (language strings, sample content, `/tk/` routes, `hreflang="tk"` output).
- Stale `vite-tsconfig-paths` from lockfile.
- Legacy i18n cleanup artifacts.

### Fixed

- Docker build: `nginx.conf` excluded from build context (`.dockerignore` fix); container now runs nginx as non-root user with restricted write access.
- Docker CSP parity: nginx now receives the same per-script `sha256-` CSP allowlist as Cloudflare, replacing the weaker `'unsafe-inline'` fallback.
- Clean install: 8 runtime + 5 dev dependencies moved from transitive to direct so `pnpm install --frozen-lockfile` succeeds on a fresh checkout.
- Stale Pagefind files after rebuilds: `clean-dist-pagefind.mjs` wipes old fragments; `copy-pagefind.mjs` uses atomic staging.
- Copy button cleanup after page swaps: DOM cleanup now also removes wrapper and button elements.
- Sitemap `x-default`: correctly omitted when a multilingual post group lacks a default-locale sibling.
- Sitemap static-route hreflang: non-post pages now carry full locale-alternate annotations.
- Breadcrumb JSON-LD: locale-prefixed paths no longer concatenate without a slash separator.
- Tag index pages: no longer render duplicate `<header>` / `<footer>` inside `Layout`.
- `rehypeFigureCaption`: recognizes `ariaLabelledBy` (camelCase HAST property) instead of overwriting existing accessible names.
- `safeStorage`: sibling cache invalidation now clears only stale `null` sentinels, preserving recovered store handles.
- RSS feeds: include `xmlns:atom` alongside `atom:updated`.
- ESLint: 2 dead disable directives removed; `unused-vars` rule honors `_`-prefix convention for intentional unused parameters.

### Security

- Build-time CSP hash generation with per-script `sha256-` allowlist (emitted to both `_headers` and `nginx-headers.conf`).
- Nginx security headers: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, COOP, CORP, COEP, plus gzip and cache-control hardening.
- Content trust boundary documented: single-author, `rehype-sanitize` off; `check-md-script.mjs` and `check-iframe-allowlist.mjs` enforce the contract.
- `check-security.mjs` asserts Mermaid `securityLevel: "strict"` and CSP `object-src 'none'` + `frame-ancestors 'none'`.
- External links: `target="_blank"` + `rel="noopener noreferrer"` with locale-aware accessible labels; internal links stripped of misplaced `target="_blank"`.
- JSON-LD output: safely escaped (U+2028/U+2029 line terminators, `</` sequences) with well-formedness assertion.
- Docker hardening: digest-pinned base images, non-root nginx worker, write access restricted to cache and pid paths only.
