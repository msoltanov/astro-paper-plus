# Contributing

Thanks for your interest in contributing to **AstroPaper+** 🎉
AstroPaper+ is a community-maintained fork of
[AstroPaper](https://github.com/satnaing/astro-paper) that adds
multi-language content support (English / Russian / Turkish)
and a small set of quality-of-life improvements on top of upstream.

Whether you're filing a bug, fixing a typo, or proposing a new feature —
your contribution matters. This document explains how to get started.

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
By participating, you agree to uphold its terms.

---

## Project layout (the bits you'll touch most)

```
src/
├── components/          # shared Astro components
├── layouts/             # page & post layouts
├── pages/               # routes (en / [locale] for i18n)
├── i18n/                # language strings + helpers
│   └── lang/<locale>.ts # one file per locale
├── content/
│   ├── posts/           # blog posts, organised by locale
│   │   ├── en/
│   │   ├── ru/
│   │   └── tr/
│   ├── projects/        # project cards (3 locales)
│   ├── pages/           # standalone pages like /about (3 locales)
│   └── galleries/       # image galleries (3 locales)
├── utils/               # reusable helpers (locale detection, paths, etc.)
└── styles/              # CSS

astro-paper.config.ts    # user-defined site configuration
astro.config.ts          # Astro framework config
```

### Where to ask questions / chat

- **Bugs & feature requests**: open an
  [issue](https://github.com/msoltanov/astro-paper-plus/issues).
- **Security issues**: see [SECURITY.md](SECURITY.md) — **do not open a
  public issue** for security bugs.
- **Upstream AstroPaper** (the original project this fork is based on):
  → [satnaing/astro-paper](https://github.com/satnaing/astro-paper).

---

## Reporting bugs

Use the [bug report issue template](.github/ISSUE_TEMPLATE/bug_report.yml).
Please include:

- A **clear, descriptive** title.
- **Reproduction steps** (the smallest steps that trigger the bug).
- **Expected vs actual behaviour**.
- Environment details (Node version, pnpm version, OS, browser).
- If relevant: a link to a public reproduction (StackBlitz, CodeSandbox,
  repo) is hugely appreciated.

---

## Suggesting features

Use the [feature request issue template](.github/ISSUE_TEMPLATE/feature_request.yml).
Please describe **the problem first**, then the proposed solution - what
you'd like to see change and *why*.

---

## Contributing code

We use [Conventional Commits](https://www.conventionalcommits.org/) for
commit messages (enforced via `cz.yaml`). PRs that follow the convention
get auto-bumped into the changelog.

### Setup

```bash
git clone https://github.com/msoltanov/astro-paper-plus.git
cd astro-paper-plus
pnpm install
pnpm dev
```

> **Local-build prerequisite — `_headers` is required.**
> The custom Cloudflare-headers integration at
> `src/integrations/cloudflareHeaders.ts` reads the `_headers` file at
> the **repository root** at build time and emits the
> `dist/nginx-headers.conf` counterpart used by the Docker /
> docker-compose deploy. A fresh `git clone` followed by `pnpm build`
> **without** the `_headers` file in place fails with a loud
> `cloudflareHeadersIntegration: _headers file not found at ...` error.
>
> The Dockerfile already ships `_headers` via `COPY`, so production
> builds are unaffected — this note is purely for local contributors
> running `pnpm build` outside the container.
>
> The file is tracked by git, so `git clone` and `git pull` always
> have it. Don't `rm _headers` thinking it's redundant — the
> Cloudflare Pages deploy relies on it.

### Post date timezones

Post dates are interpreted in the IANA timezone configured in
`astro-paper.config.ts`. Use `UTC` when the date represents a shared
collaboration deadline, the project's `Asia/Ashgabat` default for local
project dates, or the contributor's actual IANA timezone when dates are
intended to follow a contributor's location. The accepted field contract is
defined in `src/types/config.ts`.


Run the quality gates locally — they are exactly what CI runs:

```bash
pnpm format:check   # prettier --check
pnpm lint           # eslint
pnpm exec astro check   # tsc + astro content check
pnpm test           # vitest
pnpm build          # production build
```

All five should be green before you push.

### Coding conventions

- **TypeScript strict** — no implicit `any` in new code.
- **i18n-first** — every user-facing string goes through
  `src/i18n/lang/<locale>.ts`. Don't hard-code English in components.
- **Keep the upstream attribution** intact when adapting content from
  upstream AstroPaper posts — see the footer convention below.
- **Match the existing code style** — prettier is configured; if in
  doubt, run `pnpm format` before committing.
- **Add tests** for new utility functions in `src/utils/` (they have
  established test files next to them under `src/__tests__/`).

### Cache pattern for module-scope memoised state

A handful of helpers (e.g. `safeStorage`, `archivesGrouping`,
`rehypeExternalLinks`) memoise state at module scope for the
lifetime of a build process. When you introduce a new one, follow
this three-piece contract:

1. **Memoised state lives in a module-level `let`** — never on a
   shared mutable export, never on a global. The build is single-
   threaded per process, so a plain `let` is enough.
2. **Expose a public invalidation function** named after the cache
   (e.g. `invalidateArchivesDtfCache()`) so production callers can
   drop the cache when the underlying input genuinely changes.
3. **Expose a `__reset…ForTesting()` helper** alongside the public
   invalidate, dedicated to vitest and gated by the underscore
   prefix in the name. Tests call the underscore-prefixed version
   between cases; the public version exists for runtime callers.
4. **Reset in vitest `beforeEach`** — caches shared across test
   files leak state otherwise. The existing test files
   (`safeStorage.test.ts`, `archivesGrouping.test.ts`,
   `parseDateInTzCore.test.ts`) demonstrate the convention.

Failing to follow this leaves caches stuck across test cases or
across multi-page renders in the same process — the failure mode is
"the second test gets stale data from the first", which is hard to
debug after the fact.

### Translated upstream articles — attribution convention

When you write a translation or adapted version of an upstream AstroPaper
post (release notes, docs, etc.), end the article with a footer like:

```markdown
---

> Originally written by [Sat Naing](https://github.com/satnaing) on
> [satnaing.dev](https://satnaing.dev/). Translated for and
> maintained in the AstroPaper+ fork by
> [Mekan Soltanov](https://github.com/msoltanov).
```

Replace links with the correct original post URL. This pattern keeps
attribution honest without cluttering the article body.

### Pull request checklist

- [ ] Code is formatted (`pnpm format`)
- [ ] Lint passes (`pnpm lint`)
- [ ] `pnpm exec astro check` is clean
- [ ] Tests added / updated for new behaviour
- [ ] Conventional Commits message
- [ ] Linked the issue being fixed (if any)
- [ ] For new strings: added translations for **all three** locales
  (en / ru / tr)

---

## Localisation (l10n / i18n)

The project ships with three locales:
🇬🇧 English (`en`) · 🇷🇺 Russian (`ru`) · 🇹🇷 Turkish (`tr`).

**All three locales must stay in sync.** When you add or change a key in
`src/i18n/lang/en.ts`, mirror the change in `ru.ts` and `tr.ts`. The test
[`src/__tests__/i18n.test.ts`](src/__tests__/i18n.test.ts)
asserts that **every leaf key in `en.ts` exists in every locale** with
a non-empty string value — so missing translations fail the test
suite immediately.

When adding a new locale, see
[`src/i18n/lang/`](src/i18n/lang/) for the typed `UIStrings` contract and
the `tplStr` helper for parameterised strings.

### Environment variables (`astro:env`)

See [`docs/env.md`](docs/env.md) for the canonical schema reference,
the rationale behind each `context:` slot, and the contributor
checklist for adding a new env var.

---

## `.legacy-i18n-cleanup/` is intentionally excluded

The directory `.legacy-i18n-cleanup/` holds **historical** migration
scripts and archived tag-archive data from the early i18n refactor
(see git history pre-2025). It is **not** part of the running app.

To keep it from polluting the quality gates, it's excluded from:

- `tsconfig.json` (`exclude` array — no typecheck)
- `eslint.config.js` (`ignores` — no lint)
- `.gitleaks.toml` (`[allowlist]` — no secret scan noise)
- `.dockerignore` — not shipped to the production image
- `.gitignore` — files inside are not tracked

If you're debugging an old migration script in this directory, run it
manually with `node` or `vitest run` from the repo root — it will not
be picked up by `pnpm test`, `pnpm exec astro check`, or
`pnpm lint`.

---

## Adding a blog post (or project / page / gallery)

Follow the conventions in the per-locale "adding new …" guides under
[`src/content/posts/`](src/content/posts/) — they cover file placement,
frontmatter, images, and the per-locale directory layout.

---

## Code of Conduct violations

Report serious or repeated violations to
**msoltanov@users.noreply.github.com** (or open a
[private security advisory](https://github.com/msoltanov/astro-paper-plus/security/advisories/new)
on GitHub). All reports are reviewed and kept confidential.

---

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE) — the same license used by the
upstream project and this fork.
