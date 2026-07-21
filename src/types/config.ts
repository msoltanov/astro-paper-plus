/**
 * Locale-aware date format options for the post detail / listing dates
 * (Datetime.astro). Defaults to `{ day: "numeric", month: "short",
 * year: "numeric" }`, which renders as e.g. "Jul 15, 2025" in English,
 * "15 июл. 2025 г." in Russian, "15 Tem 2025" in Turkish, etc. — driven
 * by the active locale's CLDR data, no extra config required.
 *
 * Override per-site to change the pattern globally. See MDN for the full
 * `Intl.DateTimeFormatOptions` shape:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat#options
 */
type PostDateFormat = Intl.DateTimeFormatOptions;
/**
 * Compact date format for project cards (year + month only by default).
 * Defaults to `{ year: "numeric", month: "short" }`.
 */
type ProjectDateFormat = Intl.DateTimeFormatOptions;

interface DateFormatConfig {
  /** Used by `<Datetime />` on post detail / listing / gallery detail. */
  post?: PostDateFormat;
  /** Used by `<ProjectCard />` for compact project timestamps. */
  project?: ProjectDateFormat;
}

interface SiteConfig {
  /** Deployed URL of the site, e.g. "https://example.com" */ url: string;
  /** Blog title shown in header and meta tags */ title: string;
  /** Short description used in SEO meta and RSS feed */ description: string;
  /** Default post author name */ author: string;
  /** Author profile URL (used in structured data) */ profile?: string;
  /** Fallback OG image filename in /public, e.g. "og.jpg" */ ogImage?: string;
  /** HTML lang attribute, defaults to "en" */ lang?: string;
  /** IANA timezone for post dates, e.g. "Asia/Bangkok" */ timezone?: string;
  /**
   * Date display formats. Each sub-key is an `Intl.DateTimeFormatOptions`
   * object — anything `Intl.DateTimeFormat` accepts (weekday, era, hour12,
   * fractionalSecondDigits, etc.). Locale-specific CLDR overrides
   * (`day: "2-digit"`, `month: "long"`, ...) are picked up automatically
   * by `Intl.DateTimeFormat` for each of the three supported locales.
   */
  dateFormat?: DateFormatConfig;
  /** Text direction */ dir?: "ltr" | "rtl" | "auto";
  /** Google Search Console verification meta tag value */ googleVerification?: string;
}
interface PostsConfig {
  /** Posts per page on paginated listing pages */ perPage?: number;
  /** Posts shown on the index/home page */ perIndex?: number;
}
interface ContentConfig {
  /**
   * Scheduled posts (galleries, projects, posts) within this window
   * (ms) of their pubDatetime are shown as published. Defaults to
   * 15 minutes.
   *
   * T2-10: was previously named `posts.scheduledPostMargin`, which
   * was misleading — the knob applies to every content collection
   * (posts / galleries / projects), not just posts. The legacy
   * `posts.scheduledPostMargin` key is no longer accepted; remove
   * it from `astro-paper.config.ts` and move the value here.
   */
  scheduledPostMargin?: number;
}
interface FeaturesConfig {
  /** Enable light/dark mode toggle. Defaults to true. */
  lightAndDarkMode?: boolean;
  /**
   * Generate dynamic OG images per post and provide `/og.png` when the static
   * `public/{site.ogImage}` file is absent. When false, that file is required
   * for the default layout OG image (build fails if missing).
   */
  dynamicOgImage?: boolean;
  /** Show back button on post detail pages. Defaults to true. */
  showBackButton?: boolean;
  /** "Edit page" link shown on post detail pages. */ editPost?:
    | {
        enabled: true;
        /** Base URL for the edit link, e.g. GitHub edit URL */ url: string;
      }
    | { enabled: false };
  /**
   * Search provider. "pagefind" ships in the base template.
   * Set to false to disable search entirely.
   */
  search?: "pagefind" | false;
  /**
   * Enable the image-gallery feature. When true, the `/galleries/`
   * listing + per-gallery pages and the "Galleries" nav link are built
   * from the `galleries` content collection. Defaults to false (opt-in)
   * so existing sites aren't surprised by a new top-level route.
   */
  enableGalleries?: boolean;
  /**
   * Build the `/archives/` page (a compact grouped-by-year index of all
   * non-draft posts) and surface an "Archives" header link. Defaults
   * to `true`. Flip to `false` to drop both the route and the nav entry.
   */
  showArchives?: boolean;
}
/**
 * Filename stems of SVGs under `src/assets/icons/socials/`.
 *
 * Profiles and share links both consume this set — except `github`,
 * which is profile-only (a "share to GitHub" action isn't a meaningful
 * primitive). When you drop a new SVG into that folder, add the stem
 * to the appropriate union below; TypeScript then catches typos in
 * `astro-paper.config.ts` at config-edit time instead of producing a
 * blank icon at runtime.
 */
export const SOCIAL_ICON_NAMES = [
  "x",
  "whatsapp",
  "telegram",
  "pinterest",
  "mail",
  "linkedin",
  "github",
  "facebook",
] as const;
export type SocialIconName = (typeof SOCIAL_ICON_NAMES)[number];

export const SHARE_ICON_NAMES = [
  "x",
  "whatsapp",
  "telegram",
  "pinterest",
  "mail",
  "linkedin",
  "facebook",
] as const;
export type ShareIconName = (typeof SHARE_ICON_NAMES)[number];

interface SocialLink {
  /** Filename stem of an SVG under `src/assets/icons/socials/`. */
  name: SocialIconName;
  url: string;
  /**
   * Accessible label for the icon link (aria-label, title attribute).
   * Auto-generated if omitted: "{site.title} on GitHub", "Send an email to {site.title}", etc.
   * Override when the default wording doesn't fit.
   */
  linkTitle?: string;
}
interface ShareLink {
  /** Filename stem of an SVG under `src/assets/icons/socials/`. */
  name: ShareIconName;
  /** Base share URL. The post URL will be appended as a query param. */
  url: string;
  /**
   * Accessible label for the icon link (aria-label, title attribute).
   * Auto-generated if omitted: "Share this post on Facebook", "Share this post via WhatsApp", etc.
   * Override when the default wording doesn't fit.
   */
  linkTitle?: string;
}
interface AstroPaperConfig {
  site: SiteConfig;
  posts?: PostsConfig;
  content?: ContentConfig;
  features?: FeaturesConfig;
  /** Social profile links shown in header/footer */ socials?: SocialLink[];
  /** Share links shown on post detail pages */ shareLinks?: ShareLink[];
}
type ResolvedSiteConfig = Required<
  Pick<
    SiteConfig,
    | "url"
    | "title"
    | "description"
    | "author"
    | "lang"
    | "timezone"
    | "dir"
    | "ogImage"
  >
> & {
  /**
   * Fully-resolved date formats — both `post` and `project` are always
   * present after `src/config.ts` applies defaults, so callers can read
   * them directly without optional-chaining.
   */
  dateFormat: Required<DateFormatConfig>;
} & Pick<SiteConfig, "profile" | "googleVerification">;
export interface ResolvedAstroPaperConfig {
  site: ResolvedSiteConfig;
  posts: Required<PostsConfig>;
  content: Required<ContentConfig>;
  features: Required<FeaturesConfig>;
  socials: SocialLink[];
  shareLinks: ShareLink[];
}

/**
 * Type helper for astro-paper.config.ts.
 * Provides full IntelliSense without any runtime overhead.
 */
export function defineAstroPaperConfig(
  config: AstroPaperConfig
): AstroPaperConfig {
  return config;
}
