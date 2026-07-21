/**
 * Internal resolved configuration used throughout the codebase.
 *
 * Prefer editing `astro-paper.config.ts` instead of this file. This module exists to
 * apply defaults and expose a fully-resolved config shape (`ResolvedAstroPaperConfig`).
 */
import userConfig from "@/astro-paper.config";
import type { ResolvedAstroPaperConfig } from "./types/config";
import { SAFE_URL_RE, normalizeUrlForValidation } from "./utils/safeUrl";
// P1-11: import from `astro:env/server` because `src/config.ts`
// runs at SSR (it's imported by frontmatter in `astro.config.ts`).
// Astro 7's `astro:env` split only puts SSR-resolvable vars on the
// `server` virtual module.
import { GOOGLE_SITE_VERIFICATION } from "astro:env/server";

const DEFAULT_OG_IMAGE = "default-og.jpg";

const DEFAULT_POST_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const DEFAULT_PROJECT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
};

/**
 * P3-30: reject obviously-placeholder hostnames in `socials` /
 * `shareLinks`. The default `astro-paper.config.ts` ships with
 * `https://github.com/msoltanov/astro-paper-plus` (real URL) plus
 * commented-out `https://x.com/your-handle` placeholders. Those
 * placeholders pass `SAFE_URL_RE` because they're valid http(s)
 * URLs, but they link to non-existent accounts.
 *
 * We only enforce the placeholder rejection at boot when the array
 * is non-empty (since the spec is "fail loud when an author intends
 * to ship a value here, but accidentally left a template placeholder"
 * — empty arrays mean "no socials intentionally" and don't trip).
 */
const PLACEHOLDER_HOSTNAMES = new Set<string>([
  "your-handle",
  "yourhandle",
  "yourmail",
  "your-email",
  "username",
  "example.com",
]);

function assertSafeUrl(label: string, url: unknown): void {
  // Order matters: the typeof guard runs BEFORE
  // `normalizeUrlForValidation`. A misconfigured `social.url` of
  // `undefined`, `0`, or any non-string truthy/falsy value used to
  // call `.replace()` first and throw a cryptic TypeError at
  // module-load time, masking the actual "this URL is invalid"
  // intent. With the guard first, we surface a clear validation
  // error tied to the offending config field.
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      `AstroPaper+: ${label} has an unsafe or missing URL — got ${JSON.stringify(url)}. ` +
        `Expected a non-empty string with one of: http(s):, mailto:, tel:, ftp:.`
    );
  }
  const normalised = normalizeUrlForValidation(url);
  if (!SAFE_URL_RE.test(normalised)) {
    throw new Error(
      `AstroPaper+: ${label} has an unsafe URL "${url}". ` +
        `Only http(s):, mailto:, tel:, ftp: are allowed.`
    );
  }
  try {
    const hostname = new URL(normalised).hostname.toLowerCase();
    const hostnameLabels = hostname.split(".");
    if (
      PLACEHOLDER_HOSTNAMES.has(hostname) ||
      hostname.endsWith(".example.com") ||
      hostnameLabels.some(label => PLACEHOLDER_HOSTNAMES.has(label))
    ) {
      throw new Error(
        `AstroPaper+: ${label} has the placeholder hostname "${hostname}". ` +
          `Replace it with your real handle before publishing.`
      );
    }
  } catch (e) {
    // Re-throw as the standard Error; the `if (typeof)` guard above
    // already catches malformed URLs. We only want to bubble the
    // placeholder case.
    if (e instanceof Error && e.message.startsWith(`AstroPaper+: ${label}`)) {
      throw e;
    }
  }
}

for (const social of userConfig.socials ?? []) {
  assertSafeUrl(`social "${social.name}"`, social.url);
}
for (const share of userConfig.shareLinks ?? []) {
  assertSafeUrl(`share "${share.name}"`, share.url);
}
if (
  userConfig.features?.editPost?.enabled &&
  userConfig.features.editPost.url
) {
  assertSafeUrl("features.editPost", userConfig.features.editPost.url);
}

const config: ResolvedAstroPaperConfig = {
  site: {
    ...userConfig.site,
    url: normaliseSiteUrl(userConfig.site.url),
    ogImage: userConfig.site.ogImage ?? DEFAULT_OG_IMAGE,
    lang: userConfig.site.lang ?? "en",
    timezone: userConfig.site.timezone ?? "UTC",
    dir: userConfig.site.dir ?? "ltr",
    googleVerification:
      userConfig.site.googleVerification || GOOGLE_SITE_VERIFICATION,
    dateFormat: {
      post: userConfig.site.dateFormat?.post ?? DEFAULT_POST_DATE_FORMAT,
      project:
        userConfig.site.dateFormat?.project ?? DEFAULT_PROJECT_DATE_FORMAT,
    },
  },
  posts: {
    perPage: userConfig.posts?.perPage ?? 4,
    perIndex: userConfig.posts?.perIndex ?? 4,
  },
  content: {
    scheduledPostMargin:
      userConfig.content?.scheduledPostMargin ?? 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: userConfig.features?.lightAndDarkMode ?? true,
    dynamicOgImage: userConfig.features?.dynamicOgImage ?? true,
    showBackButton: userConfig.features?.showBackButton ?? true,
    editPost: userConfig.features?.editPost ?? { enabled: false },
    search: userConfig.features?.search ?? "pagefind",
    enableGalleries: userConfig.features?.enableGalleries ?? false,
    showArchives: userConfig.features?.showArchives ?? true,
  },
  socials: userConfig.socials ?? [],
  shareLinks: userConfig.shareLinks ?? [],
};

/**
 * Trim ASCII whitespace from `site.url`, drop a trailing slash
 * (Astro's `site` config rejects trailing slashes anyway, so we
 * normalise here and the downstream consumers — `astro.config.ts`,
 * RSS, OG, canonical URL builders — all see the same shape), and
 * fail loud on a malformed URL. Without this every consumer would
 * have to trim independently; a future contributor re-introducing
 * a leading space in `astro-paper.config.ts` would otherwise see
 * Astro silently fix it at config-load and never notice.
 */
function normaliseSiteUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname === "/" ? trimmed.replace(/\/$/, "") : trimmed;
  } catch {
    throw new Error(
      `AstroPaper+: site.url "${url}" is not a valid absolute URL. ` +
        `Expected an absolute URL such as "https://example.com".`
    );
  }
}

export default config;
