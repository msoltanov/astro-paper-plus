name: Pull request

body:

- type: markdown
  attributes:
  value: |
  Thanks for opening a PR! Please confirm the local quality gates pass
  before requesting review:

      ```bash
      pnpm format:check
      pnpm lint
      pnpm exec astro check
      pnpm test
      pnpm build
      ```

      All five should report clean / green.

- type: dropdown
  id: type
  attributes:
  label: Type of change
  options: - Bug fix - New feature - Documentation update - Refactor (no behaviour change) - Build / tooling / CI - i18n / localisation - Translation of an upstream article
  validations:
  required: true

- type: textarea
  id: summary
  attributes:
  label: Summary
  description: |
  Short description of what changed and _why_. If it fixes an open
  issue, link it here ("Closes #123").
  placeholder: | - Replace the OG image generator with a Satori-based pipeline so each
  post gets a unique card without manual assets. - Closes #42.
  validations:
  required: true

- type: textarea
  id: testing
  attributes:
  label: How did you test?
  description: |
  What did you run / click through to verify the change? Screenshots
  for visual changes are great. Mention any new test cases you added.
  validations:
  required: true

- type: dropdown
  id: i18n
  attributes:
  label: i18n impact
  options: - No new locale strings - New strings added in all three locales (en / ru / tr) - New strings added but only some locales translated (please call out which) - Locale file added or removed (please describe)
  validations:
  required: true

- type: checklist
  id: checklist
  attributes:
  label: Checklist
  options: - label: `pnpm format:check` is green (or I ran `pnpm format` and committed the result) - label: `pnpm lint` is clean - label: `pnpm exec astro check` reports 0 errors / 0 warnings (hints are fine) - label: `pnpm test` is green (or my change is test-covered) - label: `pnpm build` succeeds end-to-end - label: I followed the [Conventional Commits](https://www.conventionalcommits.org/) convention for the commit / PR title - label: For translations: footer attributes original author + translator (see CONTRIBUTING.md)
