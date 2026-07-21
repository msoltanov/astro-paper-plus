/**
 * Per-locale dynamic-OG image endpoint — mirror of
 * `src/pages/posts/[...slug]/index.png.ts` for the `ru` / `tr`
 * routes. Same `renderPostOgPng` helper, same contract, same fallback.
 *
 * The default-locale endpoint's source comment that referenced this
 * path was, until now, a promise; this file closes it. Without a
 * parallel endpoint, per-locale post pages referenced `og:image` URLs
 * that 404'd (`/ru/posts/<slug>/index.png`).
 */
import type { APIRoute } from "astro";
import { type CollectionEntry, getCollection } from "astro:content";
import { getPostSlugSegments } from "@/utils/getPostPaths";
import { groupNonDefaultLocale } from "@/utils/groupNonDefaultLocale";
import { postFilter } from "@/utils/postFilter";
import {
  renderPostOgPng,
  postOgImageFallback,
  pngBody,
} from "@/utils/postOgImage";
import { OG_CACHE_CONTROL } from "@/utils/ogConstants";
import config from "@/config";

type Post = CollectionEntry<"posts">;

export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) return [];

  // P2-2: single `getCollection("posts")` read + a partition via
  // `groupNonDefaultLocale` instead of one `getCollection(postsByLocale(locale))`
  // call per non-default locale. The previous implementation did
  // `LOCALES.length` round-trips through the collection loader, each
  // one re-reading + re-parsing the same files. With three locales
  // today (en / ru / tr), that's 2× the IO — and grows linearly.
  const all = await getCollection("posts");
  const filtered = all.filter(postFilter).filter(({ data }) => !data.ogImage);
  const byLocale = await groupNonDefaultLocale<Post>(async () => filtered);

  const allPaths: Array<{
    params: { locale: string; slug: string };
    props: { post: Post };
  }> = [];
  for (const [locale, posts] of byLocale) {
    for (const post of posts) {
      allPaths.push({
        params: {
          locale,
          slug: getPostSlugSegments(post.id, post.filePath, post.data.slug),
        },
        props: { post },
      });
    }
  }
  return allPaths;
}

export const GET: APIRoute = async ({ props }) => {
  if (!config.features.dynamicOgImage) return postOgImageFallback();

  try {
    const png = await renderPostOgPng({
      title: props.post.data.title,
      author: props.post.data.author,
      siteTitle: config.site.title,
      description: props.post.data.description,
    });
    return new Response(pngBody(png), {
      headers: {
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": OG_CACHE_CONTROL,
      },
    });
  } catch {
    // Mirror of the default-locale endpoint's contract: a Satori render
    // crash (vendored font bytes unreadable, font path missing in the
    // prerender chunk — see T0-2) must NOT 500 the build. Fall back to
    // the same empty 1×1 PNG that `src/pages/og.png.ts` uses, gated by
    // `scripts/check-og.mjs` post-build. Without this parity the build
    // aborts on the first per-locale OG endpoint.
    return postOgImageFallback();
  }
};
