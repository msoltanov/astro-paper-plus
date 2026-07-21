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
import { DEFAULT_LOCALE } from "@/i18n/locales";
import config from "@/config";

// Default-locale-only feed — non-default locales serve their own at
// `src/pages/[locale]/rss.xml.ts`. Localized channel title/description
// come from the active locale's `UIStrings.pages` entry so the English
// site description never leaks into a non-English feed.
export const GET: APIRoute = async () => {
  // P1-3: filter drafts / scheduled-before-window posts so the feed
  // doesn't leak URLs the post index has already hidden.
  const posts = (
    await getCollection("posts", postsByLocale(DEFAULT_LOCALE))
  ).filter(postFilter);
  const sortedPosts = getSortedPosts(posts);
  const t = useTranslations(DEFAULT_LOCALE);

  return rss({
    title: t.pages.feedTitle,
    description: t.pages.feedDescription,
    site: config.site.url,
    // R2: declare xmlns:atom so the <atom:updated> customData below is
    // a well-formed namespaced element. Without this every
    // namespace-aware XML parser (W3C feed validator, podcast
    // platforms, strict feed readers) drops the whole feed.
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>${DEFAULT_LOCALE}</language>`,
    items: sortedPosts.map(post => ({
      link: getPostUrl(post.id, post.filePath, DEFAULT_LOCALE, post.data.slug),
      title: post.data.title,
      // P1-3: emit the description via sanitizeRssDescription. RSS
      // readers render `<description>` as HTML, so un-sanitised
      // javascript: hrefs would execute in the reader. The helper
      // strips `href` from any anchor whose URL scheme is dangerous
      // and hands the result back as-is — the XML serializer
      // (`@astrojs/rss` → `fast-xml-parser`) entity-encodes `<` / `>`
      // / `&` / `"` once on the way out, so we MUST NOT pre-escape
      // (double-escape → `&amp;amp;` in the feed).
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
