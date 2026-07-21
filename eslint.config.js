import eslintPluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  ...eslintPluginAstro.configs.recommended,
  // The astro plugin re-hosts the upstream `eslint-plugin-jsx-a11y`
  // rules under the `astro/jsx-a11y/*` namespace and uses its own
  // parser to walk `<template>` content as JSX (the standalone
  // `eslint-plugin-jsx-a11y` throws on the v10 flat-config loader
  // because the astro AST is not a standard JSX tree). MEDIUM #19
  // in issues.md asked for the recommended a11y rule set; v2.1.1 of
  // the astro plugin ships the rules but `configs["flat/jsx-a11y-recommended"]`
  // is effectively empty (only `prettier/prettier: off`), so we
  // wire the rule list directly. Names match the upstream
  // `eslint-plugin-jsx-a11y` `recommended` set + 3 extras available
  // in v2.1.1 that weren't in upstream's recommended when this file
  // was written: `lang`, `no-aria-hidden-on-focusable`,
  // `prefer-tag-over-role`. `label-has-for` was in the legacy
  // recommended list but removed upstream and isn't present in
  // v2.1.1; `label-has-associated-control` (above) is its successor
  // and covers the same ground.
  {
    files: ["**/*.astro"],
    plugins: { astro: eslintPluginAstro },
    rules: {
      "astro/jsx-a11y/alt-text": "error",
      "astro/jsx-a11y/anchor-ambiguous-text": "error",
      "astro/jsx-a11y/anchor-has-content": "error",
      "astro/jsx-a11y/anchor-is-valid": "error",
      "astro/jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "astro/jsx-a11y/aria-props": "error",
      "astro/jsx-a11y/aria-proptypes": "error",
      "astro/jsx-a11y/aria-role": "error",
      "astro/jsx-a11y/aria-unsupported-elements": "error",
      "astro/jsx-a11y/autocomplete-valid": "error",
      "astro/jsx-a11y/click-events-have-key-events": "error",
      "astro/jsx-a11y/control-has-associated-label": "error",
      "astro/jsx-a11y/heading-has-content": "error",
      "astro/jsx-a11y/html-has-lang": "error",
      "astro/jsx-a11y/iframe-has-title": "error",
      "astro/jsx-a11y/img-redundant-alt": "error",
      "astro/jsx-a11y/interactive-supports-focus": "error",
      "astro/jsx-a11y/label-has-associated-control": "error",
      "astro/jsx-a11y/lang": "error",
      "astro/jsx-a11y/media-has-caption": "error",
      "astro/jsx-a11y/mouse-events-have-key-events": "error",
      "astro/jsx-a11y/no-access-key": "error",
      "astro/jsx-a11y/no-aria-hidden-on-focusable": "error",
      "astro/jsx-a11y/no-autofocus": "error",
      "astro/jsx-a11y/no-distracting-elements": "error",
      "astro/jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
      "astro/jsx-a11y/no-noninteractive-element-interactions": "error",
      "astro/jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
      "astro/jsx-a11y/no-noninteractive-tabindex": "error",
      "astro/jsx-a11y/no-redundant-roles": "error",
      "astro/jsx-a11y/no-static-element-interactions": "error",
      "astro/jsx-a11y/prefer-tag-over-role": "error",
      "astro/jsx-a11y/role-has-required-aria-props": "error",
      "astro/jsx-a11y/role-supports-aria-props": "error",
      "astro/jsx-a11y/scope": "error",
      "astro/jsx-a11y/tabindex-no-positive": "error",
    },
  },
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: { parser: tsParser },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tsParser },
    plugins: { "@typescript-eslint": tsPlugin },
    // Flat-config equivalent of the legacy
    // `@typescript-eslint/recommended` config. Mechanical rules only
    // (`no-unused-vars`, `no-shadow`, `no-unused-expressions`, …) —
    // nothing that would generate noise on existing code, but enough
    // to catch the dead exports / `as any` casts that bit this
    // project in the past (Q1, Q5 in issues.md).
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Honor the conventional `_`-prefix opt-out for intentional
      // unused parameters (try/catch, callback placeholders). The
      // default TS rule flags `_e` in `catch (_e)` even though the
      // bare JS convention treats underscore-prefixed names as
      // intentional; the inline FOUC script in `Layout.astro` relies
      // on this pattern.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Re-declared as the override scope is `src/**` below; the
      // intersection is the same rule, scoped to TS files only.
      "no-console": "error",
    },
  },
  {
    // `no-console` is scoped to source code only — utility scripts
    // under `scripts/` legitimately log, and Astro integrations
    // emit via `console.*` (no Astro logger in `astro:build:setup`).
    files: ["src/**"],
    rules: {
      "no-console": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "public/pagefind/**",
      "coverage/**",
      // Build / gate helper scripts. Linting these adds friction without
      // value — they're exercised by the gate itself (lint + build) and
      // their surface is narrow (no business logic worth checking).
      "scripts/**",
      // Legacy i18n-cleanup scratch dir; contains throwaway deletion helpers
      // that intentionally use `console.log` and `process.exit`.
      ".legacy-i18n-cleanup/**",
    ],
  },
];
