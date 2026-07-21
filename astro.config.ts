import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import { unified } from "@astrojs/markdown-remark";
import { LOCALES, DEFAULT_LOCALE } from "./src/i18n/locales";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName.ts";
import { xtermLight, xtermDark } from "./src/utils/shiki/themes";
import config from "./astro-paper.config";
import { remarkPlugins, rehypePlugins } from "./src/remark-plugins";
import { sitemapIntegration } from "./src/integrations/sitemap";
import { cloudflareHeadersIntegration } from "./src/integrations/cloudflareHeaders";
import { fileURLToPath } from "node:url";

// Custom sitemap integration (see `src/integrations/sitemap.ts`).
// Replaces `@astrojs/sitemap` so we can:
//
//   1. Emit per-post `<lastmod>` derived from frontmatter.
//   2. Split posts into their own `sitemap-posts-0.xml` chunk for
//      Search Console coverage audits.
//   3. Emit hreflang `<xhtml:link rel="alternate">` annotations
//      across all supported locales.
//
// We deliberately don't set `<priority>` (Google has ignored it since
// ~2020) or reorder the XML (file order is not a ranking signal).
//
// Note on data source: the natural API would be `getCollection("posts")`
// from `astro:content`, but that virtual module's module runner is
// torn down before any Astro integration hook fires in this version
// ("Vite module runner has been closed"). The integration therefore
// reads post files from disk via `loadPostsFromDisk`, which is always
// available.

const sitemap = sitemapIntegration({
  baseUrl: config.site.url,
  defaultTimezone: config.site.timezone ?? "UTC",
  contentDir: fileURLToPath(new URL("./src/content/", import.meta.url)),
  scheduledMarginMs: config.content?.scheduledPostMargin ?? 15 * 60 * 1000,
});

export default defineConfig({
  site: config.site.url,
  integrations: [mdx(), sitemap, cloudflareHeadersIntegration],
  // Enable Astro's responsive image layout globally so every `![alt](src)` in
  // markdown gets a real multi-width `srcset` (and matching `sizes`) instead
  // of a single full-resolution `<img>`. We deliberately leave
  // `responsiveStyles` OFF because this project uses Tailwind v4 cascade
  // layers, and Astro's default `:where([data-astro-image])` rules would
  // outrank Tailwind utilities — see:
  // https://docs.astro.build/en/guides/images/#responsive-images-with-tailwind-4
  image: { layout: "constrained" },
  i18n: {
    // Single source of truth lives in `src/i18n/locales.ts` — we don't
    // hardcode the array here anymore (rule: add a language once, in one
    // place). `LOCALES` is `readonly ["en" | "ru" | "tr"]` so
    // Astro's spread accepts the union types as expected.
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: {
      // Astro auto-prefixes non-default locales with the locale code.
      // Dynamic routes that need per-locale content (e.g. post slugs)
      // filter their getStaticPaths manually so Astro does not generate
      // URLs for posts that don't exist in a given locale.
      prefixDefaultLocale: false,
    },
  },
  // #20 COR — `trailingSlash` is intentionally left at Astro's
  // default of `"ignore"`, which means a request for `/about` and
  // `/about/` both serve the same HTML (built as `dist/about/index.html`).
  // URL builders (sitemap, hreflang, RSS, og:image, canonical) all
  // emit directory-style paths WITH a trailing slash (e.g. `/about/`),
  // which is the canonical form per RFC 3986 and what the sitemap
  // cluster agrees with. If a future contributor switches this to
  // `"always"` or `"never"`, every URL builder needs to follow in
  // lock-step — the `trailingSlash` setting is the contract the rest
  // of the codebase assumes. Tests under `src/__tests__/` (notably
  // `setup.test.ts`, `contentUrl.test.ts`, and `getPostPaths.test.ts`)
  // pin the trailing-slash shape for the current setting.
  trailingSlash: "ignore",
  markdown: {
    processor: unified({
      // Sharing these plugin arrays through `src/remark-plugins.ts` keeps
      // `.md` and `.mdx` pipelines identical. The exports are typed as
      // `AstroPluggableList` (see `src/remark-plugins.ts`), which is
      // exactly the union `unified`'s `Processor.remarkPlugins` /
      // `rehypePlugins` slots accept — narrower than `PluggableList`
      // (it excludes `Preset` entries, which the processor rejects),
      // wider than the unannotated literal would infer. No `as any`
      // cast needed at the call site (MEDIUM #28 in issues.md).
      remarkPlugins,
      rehypePlugins,
    }),
    shikiConfig: {
      // Custom xterm 16-color themes (see src/utils/shiki/themes.ts).
      // Hex values mirrored against the `--term-*` palette in
      // `src/styles/theme.css` so syntax colours and any Tailwind
      // utility (`text-term-red`, `bg-term-green`, …) stay in sync.
      // `defaultColor: false` makes Shiki emit `--shiki-light` /
      // `--shiki-dark` CSS vars per token — flipping the data-theme
      // attribute on <html> swaps every code block in one stroke.
      themes: { light: xtermLight, dark: xtermDark },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: { plugins: [tailwindcss()] },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      // Ship woff2 only for web visitors — woff2 is universally
      // supported by every browser shipped after 2019, is ~30%
      // smaller than woff, and ~50% smaller than ttf. The OG
      // image generator (`src/pages/og.png.ts`,
      // `src/utils/postOgImage.ts`) does NOT go through this
      // config — it reads vendored TTFs from `src/assets/fonts/`
      // directly, so the Satori/Sharp pipeline still has the
      // TTF bytes it needs. If a future browser without woff2
      // support has to be served, add `"woff"` here.
      formats: ["woff2"],
    },
  ],
  env: {
    schema: {
      // P1-11: was `context: "client"` which (Astro 7's `astro:env`
      // split) makes the var client-public only — useless at SSR
      // where `src/config.ts:62-63` reads it. Server + public is
      // the exact Astro 7 idiom for "read the value at SSR, ship
      // it to the client bundled with the SSR-emitted HTML".
      //
      // The legacy `PUBLIC_` prefix is misleading — under Astro 7
      // `context: "server"` makes the var SSR-only and the prefix
      // is reserved for actual client-public vars. Renamed to drop
      // the prefix; readers can infer SSR-only from the `context`.
      GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "server",
        optional: true,
      }),
    },
  },
  // TODO(astro-8) — Tracked: re-evaluate each Astro minor bump whether
  // `experimental.svgOptimizer` has graduated to a top-level
  // `svgOptimizer` field. Introduced @ 6.2.0 as experimental; Astro 7.0
  // still keeps it under `experimental`. When it stabilises, drop the
  // `experimental` key — `vite-plugin-assets.js` reads the legacy
  // path indefinitely for back-compat, but the build log will start
  // deprecation-squelching the unused experimental block.
  // Tracking URL (issues.md #M29):
  //   https://github.com/msoltanov/astro-paper-plus/issues/new
  //   (use title `chore: migrate svgOptimizer out of experimental
  //   once Astro 8 ships`)
  experimental: { svgOptimizer: svgoOptimizer() },
});
