import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getPostSlugSegments } from "@/utils/getPostPaths";
import { postsByLocale } from "@/utils/postsByLocale";
import { postFilter } from "@/utils/postFilter";
import {
  renderPostOgPng,
  postOgImageFallback,
  pngBody,
} from "@/utils/postOgImage";
import { OG_CACHE_CONTROL } from "@/utils/ogConstants";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import config from "@/config";

export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }

  // Default locale only — non-default locales serve OG images from
  // `src/pages/[locale]/posts/[...slug]/index.png.ts` (same shared
  // `renderPostOgPng` helper).
  //
  // P1-4: must filter drafts AND scheduled-before-window posts via
  // `postFilter` rather than the ad-hoc `!data.draft` check, otherwise
  // the OG endpoint leaks URLs for posts the post index has already
  // hidden. The sitemap could surface these URLs to crawlers.
  const posts = (await getCollection("posts", postsByLocale(DEFAULT_LOCALE)))
    .filter(postFilter)
    .filter(({ data }) => !data.ogImage);

  return posts.map(post => ({
    params: {
      slug: getPostSlugSegments(post.id, post.filePath, post.data.slug),
    },
    props: post,
  }));
}

export const GET: APIRoute = async ({ props }) => {
  if (!config.features.dynamicOgImage) return postOgImageFallback();

  try {
    const png = await renderPostOgPng({
      title: props.data.title,
      author: props.data.author,
      siteTitle: config.site.title,
      description: props.data.description,
    });
    return new Response(pngBody(png), {
      headers: {
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": OG_CACHE_CONTROL,
      },
    });
  } catch {
    // Vendored font files are missing or Satori crashed mid-render
    // — emit the empty 1×1 PNG fallback so referencing the per-post
    // OG endpoint doesn't 500. Same contract as `src/pages/og.png.ts`,
    // which is gated by `scripts/check-og.mjs` post-build.
    return postOgImageFallback();
  }
};
