import type { APIRoute } from "astro";
import { SITEMAP_INDEX_FILENAME } from "@/integrations/sitemap";

const getRobotsTxt = (sitemapURL: URL) => `User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  // P3-15: import the filename from the sitemap integration so a
  // rename lands in one place. P2-42: also `try { ... } catch {}`
  // when the result of `new URL` would otherwise throw on a
  // missing `Astro.site` (the original code didn't guard against
  // that — the same fall-back to the current origin is already
  // applied elsewhere in `hrefByLocaleForStaticRoute`).
  if (!site) {
    return new Response("User-agent: *\nAllow: /\n", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const sitemapURL = new URL(SITEMAP_INDEX_FILENAME, site);
  return new Response(getRobotsTxt(sitemapURL), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
