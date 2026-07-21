import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // Placeholder — RFC 2606 reserved, so it can never be claimed by a
    // third party. Replace with your real origin before deploying:
    // every canonical URL, hreflang alternate, sitemap <loc>, RSS link
    // and absolute og:image is derived from this value.
    url: "https://example.com/",
    title: "AstroPaper+",
    description:
      "AstroPaper+ — a minimal, responsive, accessible and SEO-friendly Astro blog theme (AstroPaper+ v7). Originally based on AstroPaper by Sat Naing (MIT).",
    author: "Mekan Soltanov",
    profile: "https://github.com/msoltanov",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Asia/Ashgabat",
    // Customizable date display formats. Each value is an
    // `Intl.DateTimeFormatOptions` object — anything `Intl.DateTimeFormat`
    // accepts works (weekday, era, hour12, fractionalSecondDigits, etc.).
    // Locale-specific CLDR overrides (e.g. `month: "long"`, `day: "2-digit"`)
    // are applied automatically for each of the three supported locales
    // (en/ru/tr), so the format itself stays locale-agnostic.
    //
    // Defaults:
    //   post:    { day: "numeric", month: "short", year: "numeric" }
    //   project: { year: "numeric", month: "short" }
    //
    // Uncomment and edit to override:
    // dateFormat: {
    //   post:    { day: "2-digit", month: "long", year: "numeric" },
    //   project: { year: "numeric", month: "long" },
    // },
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
  },
  content: {
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      // Points to the fork repo. Change to the upstream URL when upstreaming patches.
      url: "https://github.com/msoltanov/astro-paper-plus/edit/master/",
    },
    search: "pagefind",
    // Issue #553: image galleries. Off by default — flip to true to
    // generate /galleries/ + the "Galleries" nav link from the
    // `galleries` content collection. See src/content/galleries/ for the
    // folder layout.
    enableGalleries: false,
    // Grouped-by-year post index at `/archives/`. On by default —
    // flip to false to drop both the route and the nav link.
    showArchives: true,
  },
  socials: [
    // Empty `socials` entries hide the social block in the footer.
    // Uncomment + fill in the entries you actually use; an empty
    // array hides the block entirely. The `url` values are
    // boot-time validated against `SAFE_URL_RE` (http/https/mailto/
    // tel/ftp only) and rejected if the hostname is a placeholder
    // like `your-handle` or `example.com` — see `src/config.ts`.
    { name: "github", url: "https://github.com/msoltanov/astro-paper-plus" },
    // { name: "x", url: "https://x.com/your-handle" },
    // { name: "linkedin", url: "https://www.linkedin.com/in/your-handle/" },
    // { name: "mail", url: "mailto:you@example.com" },
    // { name: "bluesky", url: "https://bsky.app/profile/your-handle" },
    // { name: "mastodon", url: "https://mastodon.social/@your-handle" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
