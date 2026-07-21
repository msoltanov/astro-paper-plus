import type { APIRoute } from "astro";
import { OG_CACHE_CONTROL } from "@/utils/ogConstants";
import {
  renderSiteOgPng,
  pngBody,
  postOgImageFallback,
} from "@/utils/postOgImage";
import config from "@/config";
import { LOCALES, DEFAULT_LOCALE, localeParam } from "@/i18n/locales";
import { useTranslations } from "@/i18n";

/**
 * Emit one `/<locale>/og.png` URL per non-default locale. Default
 * locale already has `/og.png` from `src/pages/og.png.ts`, so it's
 * excluded here.
 */
export async function getStaticPaths() {
  return LOCALES.filter(l => l !== DEFAULT_LOCALE).map(locale => ({
    params: { locale },
  }));
}

/**
 * Per-locale fallback OG image (`/ru/og.png`, `/tr/og.png`). Mirror of
 * `src/pages/og.png.ts` so non-default locales serve an OG image from
 * the locale-prefixed path. The text content is sourced from the
 * locale's `pages.feedTitle` / `pages.feedDescription` so crawlers
 * fetching `/ru/og.png` see a Russian-branded card instead of an
 * English one on a `/ru/` URL. L6: the tree + renderer now live in
 * `src/utils/postOgImage.ts#renderSiteOgPng` so this endpoint and the
 * default-locale one can't drift.
 */

export const GET: APIRoute = async ({ params }) => {
  const locale = localeParam(params.locale);
  const t = useTranslations(locale);

  try {
    const png = await renderSiteOgPng({
      title: t.pages.feedTitle,
      description: t.pages.feedDescription,
      hostname: new URL(config.site.url).hostname,
    });
    return new Response(pngBody(png), {
      headers: {
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": OG_CACHE_CONTROL,
      },
    });
  } catch {
    return postOgImageFallback();
  }
};
