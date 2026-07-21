import type { APIRoute } from "astro";
import { OG_CACHE_CONTROL } from "@/utils/ogConstants";
import {
  renderSiteOgPng,
  pngBody,
  postOgImageFallback,
} from "@/utils/postOgImage";
import config from "@/config";

export const GET: APIRoute = async () => {
  try {
    const png = await renderSiteOgPng({
      title: config.site.title,
      description: config.site.description,
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
    // Vendored font files are missing or malformed — emit the empty
    // 1×1 PNG fallback so referencing `/og.png` from social tags doesn't
    // 500 the build. The `scripts/check-og.mjs` gate catches this case.
    return postOgImageFallback();
  }
};
