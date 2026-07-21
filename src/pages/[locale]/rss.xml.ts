import type { APIRoute } from "astro";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { postsByLocale } from "@/utils/postsByLocale";
import { postFilter } from "@/utils/postFilter";
import { parseDateInTz } from "@/utils/parseDateInTz";
import { postDescription } from "@/utils/postDescription";
import { sanitizeRssDescription } from "@/utils/sanitizeRssDescription";
import { useTranslations } from "@/i18n";
import { LOCALES, DEFAULT_LOCALE, localeParam } from "@/i18n/locales";
import config from "@/config";

export async function getStaticPaths() {
  return LOCALES.filter(l => l !== DEFAULT_LOCALE).map(locale => ({
    params: { locale },
  }));
}

export const GET: APIRoute = async Astro => {
  const locale = localeParam(Astro.params.locale);

  // P1-3: drop drafts and pre-window scheduled posts so the feed
  // cannot leak URLs the post index hides.
  const posts = (await getCollection("posts", postsByLocale(locale))).filter(
    postFilter
  );
  const sortedPosts = getSortedPosts(posts);
  // Localized channel title/description come from the active locale's
  // UIStrings.pages entry — `config.site.description` is English and
  // would otherwise leak into the RU/TR feed channel.
  const t = useTranslations(locale);

  return rss({
    title: t.pages.feedTitle,
    description: t.pages.feedDescription,
    site: config.site.url,
    // R2 (mirrors rss.xml.ts): xmlns:atom bound so the per-item
    // <atom:updated> customData is a well-formed namespaced element.
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>${locale}</language>`,
    items: sortedPosts.map(post => ({
      link: getPostUrl(post.id, post.filePath, locale, post.data.slug),
      title: post.data.title,
      // P1-3: sanitise before emit (see rss.xml.ts for the long
      // contract). Identical function to the default-locale feed.
      // The helper drops `href` from any dangerous-scheme anchor and
      // hands back plain prose / sparse HTML; the XML serializer
      // entity-encodes the result exactly once, so any pre-escape in
      // the helper would manifest as `&amp;amp;` etc. in the feed.
      description: sanitizeRssDescription(
        postDescription(post) ?? t.pages.feedItemFallback
      ),
      // RSS `pubDate` is the publication date — use modDatetime only as
      // an optional atom:updated element, not to re-date the entry.
      pubDate: parseDateInTz(post.data.pubDatetime, post.data.timezone),
      ...(post.data.modDatetime && {
        customData: `<atom:updated>${parseDateInTz(post.data.modDatetime, post.data.timezone).toISOString()}</atom:updated>`,
      }),
    })),
  });
};
