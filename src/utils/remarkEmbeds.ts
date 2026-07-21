/**
 * `remarkEmbeds` — turn bare media URLs and provider links in markdown into
 * fully styled, accessible, privacy-aware embeds.
 *
 * Author syntax in `.md` / `.mdx`:
 *
 * A single bare URL on its own line:
 *
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *
 * → <figure data-embed="youtube">…<iframe …></iframe>…</figure>
 *
 * Or a [caption](https://youtu.be/dQw4w9WgXcQ) link:
 *
 * → <figure>…<iframe>…<figcaption>caption</figcaption></figure>
 *
 * Or pipe-syntax (mirrors markdown's existing title-after-URL syntax):
 *
 *   [Watch](https://youtu.be/dQw4w9WgXcQ "Demo video")
 *
 * For native media files:
 *
 *   https://example.com/speech.mp3
 *   https://example.com/demo.mp4
 *
 * → <figure data-embed="audio">…<audio controls preload="metadata"><source src…>
 *   …</audio>…</figure> (or `data-embed="video"`)
 *
 * Author syntax in `.mdx` (via the `VideoEmbed` / `AudioEmbed` components we
 * register through `@astrojs/mdx`'s `components` option) is layered on top —
 * the MDX components share the `provider` registry and rendering helpers here,
 * so provider rules stay in one place.
 *
 * Privacy
 * --------
 * YouTube is the only embed that monetises via cookie + IP tracking on load.
 * We default to `youtube-nocookie.com` (the privacy-enhanced domain that
 * requires an extra click before the parent domain receives any identifying
 * data). Authors can opt back to `youtube.com/embed/…` via the per-provider
 * config if they know what they're doing. Other providers here — Vimeo, Loom,
 * SoundCloud, Spotify, Bilibili, Twitch — don't track on iframe load by
 * default, so we use their stock embed URLs.
 *
 * Why a remark plugin (not just MDX components)
 * ---------------------------------------------
 * Most posts in this blog are plain `.md`, not `.mdx`. If we only shipped
 * `<VideoEmbed />` as an MDX component, every markdown post author would have
 * to either migrate to MDX or hand-roll `<iframe>` HTML. Letting authors write
 * "just the URL" in either flavour is the bit that actually improves day-to-
 * day authoring — hence the dual approach.
 */
import { visit, SKIP } from "unist-util-visit";
import { visitParents, SKIP as VP_SKIP } from "unist-util-visit-parents";
import type { Plugin } from "unified";
import type { Root, Paragraph, Link, Text } from "mdast";
// Relative (not `@/config`) on purpose: this module is pulled into the
// `astro.config.ts` graph via `remark-plugins.ts`, which jiti loads WITHOUT
// TypeScript path-alias resolution — and `@/config` also transitively imports
// `astro:env/client`, which isn't available at config-load time. Import the
// raw config directly; we only need `site.url`.
import astroPaperConfig from "../../astro-paper.config";

/** A media provider recognised by `remarkEmbeds`. */
export interface Provider {
  /** Stable id used in the emitted `data-embed="…"` attribute. */
  id:
    | "youtube"
    | "vimeo"
    | "loom"
    | "bilibili"
    | "twitch"
    | "soundcloud"
    | "spotify"
    | "video"
    | "audio";
  /** Human-readable name used in the iframe's `title` attribute (a11y). */
  name: string;
  /**
   * R13: media kind for the default `title` attribute fallback. The
   * previous shape hardcoded `"…video"` for every provider — a bare
   * SoundCloud URL rendered `title="SoundCloud video"`. The
   * `UIStrings.media` strings exist for audio vs video but the
   * renderer never read them.
   */
  kind: "video" | "audio";
  /** Test the URL — extractors like the YouTube one accept several shapes. */
  match: (url: string) => string | null;
  /** Build the embeddable markup. `id` is whatever `match` returned. */
  render: (id: string, title: string) => string;
}

/**
 * Site hostname hoisted once at module load. `new URL(...)` parses
 * on every call otherwise, which allocates a few objects per
 * YouTube/Twitch embed in every post on every build. The site URL
 * is a build-time constant (`astro-paper.config.ts` is checked-in
 * and stable), so memoising the parsed URL is safe.
 */
const SITE_URL = new URL(astroPaperConfig.site.url);
const SITE_HOSTNAME = SITE_URL.hostname;

export const FRAME_SRC_ALLOWLIST = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
  "https://player.bilibili.com",
  "https://player.twitch.tv",
  "https://w.soundcloud.com",
  "https://open.spotify.com",
] as const;

/* ----------------------- provider registry ----------------------- */

function youtubeMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      // https://youtu.be/<id>  — P1-18: the previous `pathname.replace`
      // returned the entire post-path tail (`foo/bar`) for the
      // occasional short URL of the form `https://youtu.be/foo/bar`
      // (used as chapter markers, share shortcuts, etc.). `split("/")`
      // + taking the first non-empty segment returns just `foo` —
      // which is what YouTube expects.
      const id = u.pathname.split("/").filter(Boolean)[0] ?? null;
      return id;
    }
    if (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "m.youtube.com"
    ) {
      // https://www.youtube.com/watch?v=<id> (& extras ignored)
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id || null;
      }
      // https://www.youtube.com/embed/<id>, /shorts/<id>, /live/<id>
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (m) return m[1];
    }
    if (
      u.hostname === "youtube-nocookie.com" ||
      u.hostname === "www.youtube-nocookie.com"
    ) {
      const m = u.pathname.match(/^\/embed\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function youtubeRender(id: string, title: string): string {
  // nocookie = privacy-respecting. `playsinline` keeps mobile inline.
  // We deliberately load the iframe lazily so it doesn't hurt LCP.
  // R13: `sandbox` baseline for video providers — narrow enough to
  // block top-level navigation / form submission / popup-from-sandbox
  // / scripts-allow-popups-to-escape-sandbox, wide enough for the
  // YT player to render and present fullscreen.
  const t = escapeAttr(title || "Video");
  return (
    `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" ` +
    `title="${t}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ` +
    `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" ` +
    `allowfullscreen></iframe>`
  );
}

function vimeoMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "vimeo.com" || u.hostname === "www.vimeo.com") {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) return m[1];
    }
    if (u.hostname === "player.vimeo.com") {
      const m = u.pathname.match(/^\/video\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function vimeoRender(id: string, title: string): string {
  const t = escapeAttr(title || "Video");
  return (
    `<iframe src="https://player.vimeo.com/video/${encodeURIComponent(id)}" ` +
    `title="${t}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" ` +
    `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" ` +
    `allowfullscreen></iframe>`
  );
}

function loomMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "www.loom.com" || u.hostname === "loom.com") {
      const m = u.pathname.match(/^\/share\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function loomRender(id: string, title: string): string {
  const t = escapeAttr(title || "Video");
  return (
    `<iframe src="https://www.loom.com/embed/${encodeURIComponent(id)}" ` +
    `title="${t}" loading="lazy" ` +
    `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" ` +
    `allowfullscreen></iframe>`
  );
}

function bilibiliMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "www.bilibili.com" || u.hostname === "bilibili.com") {
      const m = u.pathname.match(/^\/video\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function bilibiliRender(id: string, title: string): string {
  const t = escapeAttr(title || "Video");
  return (
    `<iframe src="https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}&autoplay=0" ` +
    `title="${t}" loading="lazy" ` +
    `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" ` +
    `allowfullscreen></iframe>`
  );
}

function twitchMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "www.twitch.tv" || u.hostname === "twitch.tv") {
      const m = u.pathname.match(/^\/videos\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function twitchRender(id: string, title: string): string {
  const t = escapeAttr(title || "Video");
  // Twitch accepts multiple `parent=` query parameters (one per
  // host that is allowed to embed the iframe), unlike most players
  // that treat `parent` as a single value. We pass both the
  // configured production hostname AND `localhost` so dev / preview
  // servers can also embed the video without an `X-Frame-Options`
  // rejection. `SITE_HOSTNAME` is hoisted to module scope so this
  // function doesn't re-parse the site URL on every embed
  // (`new URL` allocates a few objects each call).
  const parents = [SITE_HOSTNAME, "localhost"]
    .map(p => `parent=${encodeURIComponent(p)}`)
    .join("&");
  return (
    `<iframe src="https://player.twitch.tv/?video=${encodeURIComponent(id)}&${parents}" ` +
    `title="${t}" loading="lazy" ` +
    `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" ` +
    `allowfullscreen></iframe>`
  );
}

function soundcloudMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (
      u.hostname === "soundcloud.com" ||
      u.hostname === "www.soundcloud.com"
    ) {
      // We use the full URL as the "id" for SoundCloud since their embed
      // API takes the full track URL.
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function soundcloudRender(id: string, title: string): string {
  const t = escapeAttr(title || "Audio");
  // R13: audio providers get a narrower sandbox than video — no
  // `allow-presentation` (audio is mono-stream anyway) and no
  // `allow-popups` (the SC widget doesn't open one). Drop
  // `allow-popups` to keep the sandbox strict.
  return (
    `<iframe src="https://w.soundcloud.com/player/?url=${encodeURIComponent(id)}" ` +
    `title="${t}" loading="lazy" allow="autoplay" ` +
    `sandbox="allow-scripts allow-same-origin"></iframe>`
  );
}

function spotifyMatch(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "open.spotify.com" || u.hostname === "spotify.com") {
      // We'll re-emit the URL on the embed domain below.
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function spotifyRender(id: string, title: string): string {
  // Spotify embeds are only allowed via their /embed/ URL on open.spotify.com.
  // P1-17: the previous `replace` matched a URL that already contained
  // `/embed/`, producing `https://open.spotify.com/embed/embed/track/…`
  // — which 404s. Strip a pre-existing `/embed/` segment first, then
  // inject the embed domain prefix exactly once.
  const embedUrl = id.replace(
    /^https?:\/\/(open\.)?spotify\.com\/(?:embed\/)?/,
    "https://open.spotify.com/embed/"
  );
  const t = escapeAttr(title || "Audio");
  // R13: same audio-narrow `sandbox` as SoundCloud. `allow-popups`
  // would let the widget open external links top-frame, which we
  // don't want on a click-through player surface.
  return (
    `<iframe src="${escapeAttr(embedUrl)}" ` +
    `title="${t}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" ` +
    `sandbox="allow-scripts allow-same-origin" ` +
    `allowfullscreen></iframe>`
  );
}

/** Default providers registered with `remarkEmbeds`. */
export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: "youtube",
    name: "YouTube",
    kind: "video",
    match: youtubeMatch,
    render: youtubeRender,
  },
  {
    id: "vimeo",
    name: "Vimeo",
    kind: "video",
    match: vimeoMatch,
    render: vimeoRender,
  },
  {
    id: "loom",
    name: "Loom",
    kind: "video",
    match: loomMatch,
    render: loomRender,
  },
  {
    id: "bilibili",
    name: "Bilibili",
    kind: "video",
    match: bilibiliMatch,
    render: bilibiliRender,
  },
  {
    id: "twitch",
    name: "Twitch",
    kind: "video",
    match: twitchMatch,
    render: twitchRender,
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    kind: "audio",
    match: soundcloudMatch,
    render: soundcloudRender,
  },
  {
    id: "spotify",
    name: "Spotify",
    kind: "audio",
    match: spotifyMatch,
    render: spotifyRender,
  },
];

/* ----------------------- native media ----------------------- */

const NATIVE_VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
const NATIVE_AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|#|$)/i;

/** Plain absolute-URL matcher. Used to lift a bare URL on a paragraph to a
 * video/audio embed candidate before we try a specific provider. */
function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z0-9+\-.]*:\/\//i.test(url);
}

/** Build the `<figure>…<video controls preload="metadata">…</video>…</figure>`
 * wrapper for a native video source URL. */
export function renderNativeVideo(src: string, title: string): string {
  return renderFigure(
    "video",
    src,
    `<video controls preload="metadata" title="${escapeAttr(title || "Video")}">` +
      `<source src="${escapeAttr(src)}">` +
      `Your browser does not support embedded video.` +
      `</video>`,
    title
  );
}

/** Build the `<figure>…<audio controls preload="metadata">…</audio>…</figure>`
 * wrapper for a native audio source URL. */
export function renderNativeAudio(src: string, title: string): string {
  return renderFigure(
    "audio",
    src,
    `<audio controls preload="metadata" title="${escapeAttr(title || "Audio")}">` +
      `<source src="${escapeAttr(src)}">` +
      `Your browser does not support embedded audio.` +
      `</audio>`,
    title
  );
}

/** Single point that builds the `<figure data-embed=…>` wrapper so the
 * remark plugin and the `<VideoEmbed>` / `<AudioEmbed>` MDX components
 * emit identical DOM. */
function renderFigure(
  providerId: string,
  srcForAttr: string,
  inner: string,
  title: string
): string {
  return (
    `<figure data-embed="${escapeAttr(providerId)}" data-src="${escapeAttr(srcForAttr)}">` +
    inner +
    (title ? `<figcaption>${escapeText(title)}</figcaption>` : "") +
    `</figure>`
  );
}

/* ----------------------- the plugin ----------------------- */

export interface RemarkEmbedsOptions {
  /** Override the provider list. Defaults to every built-in provider. */
  providers?: Provider[];
  /** Whether to wrap bare-URL paragraphs in a provider embed. Default: true.
   * Set false to keep this plugin purely "auto-rewrite links". */
  rewriteBareUrls?: boolean;
  /** Whether to wrap bare-URL paragraphs as native `<video>`/`<audio>` when
   * the URL's file extension matches one. Default: true. */
  rewriteNativeMedia?: boolean;
}

/**
 * Pick the first provider whose `match()` returns a non-null id for the URL.
 * Returns `{ provider, id }` or `null`.
 */
function pickProvider(
  url: string,
  providers: Provider[]
): { provider: Provider; id: string } | null {
  for (const p of providers) {
    const id = p.match(url);
    if (id != null) return { provider: p, id };
  }
  return null;
}

/** Read the inline text of a markdown paragraph; if every child is a text
 * node we return the full string, otherwise null. (Used to recognise "bare
 * URL" paragraphs.) */
function paragraphAsUrl(node: Paragraph): string | null {
  if (node.children.length !== 1) return null;
  const child = node.children[0] as Text | Link;
  if (child.type === "text" && isAbsoluteUrl(child.value.trim())) {
    return child.value.trim();
  }
  if (
    child.type === "link" &&
    child.children.length === 1 &&
    child.children[0].type === "text"
  ) {
    // Bare link where the displayed text is exactly the URL (a common
    // pattern when authors paste a URL into a markdown editor that
    // auto-converts it).
    const link = child as Link;
    const displayed = (link.children[0] as Text).value.trim();
    if (displayed === link.url && isAbsoluteUrl(link.url)) {
      return link.url;
    }
  }
  return null;
}

/** Build the figure HTML for a given provider result. */
function providerFigure(
  url: string,
  provider: Provider,
  id: string,
  title: string
): string {
  // R13: pick the default title from the provider's media kind so a
  // SoundCloud link doesn't read "SoundCloud video". The English
  // literal is the current baseline — translating this through
  // `UIStrings.media.{videoPlayer,audioPlayer}` would require
  // threading the active locale through the remark plugin (which
  // runs at config-load time, before Astro's i18n context exists),
  // so the type-keyed literal is the cheapest viable shape.
  const fallbackLabel =
    provider.kind === "audio"
      ? `${provider.name} audio`
      : `${provider.name} video`;
  const inner = provider.render(id, title || fallbackLabel);
  const caption = title ? `<figcaption>${escapeText(title)}</figcaption>` : "";
  return (
    `<figure data-embed="${escapeAttr(provider.id)}" data-src="${escapeAttr(url)}">` +
    inner +
    caption +
    `</figure>`
  );
}

/** Find every provider match for the given URL. Returns the first one, if any.
 * (We only ever emit one figure per URL.) */
function urlToFigure(
  url: string,
  title: string,
  providers: Provider[],
  rewriteNativeMedia: boolean
): string | null {
  const m = pickProvider(url, providers);
  if (m) return providerFigure(url, m.provider, m.id, title);
  if (rewriteNativeMedia) {
    if (NATIVE_VIDEO_EXT.test(url)) return renderNativeVideo(url, title);
    if (NATIVE_AUDIO_EXT.test(url)) return renderNativeAudio(url, title);
  }
  return null;
}

/* ----------------------- helpers ----------------------- */

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Look up a provider by id; used by the MDX components layer. */
export function getProvider(
  id: Provider["id"],
  providers: Provider[] = DEFAULT_PROVIDERS
): Provider | undefined {
  return providers.find(p => p.id === id);
}

/** Same lookup as `pickProvider`, but exposed for the MDX components. */
export function matchProvider(
  url: string,
  providers: Provider[] = DEFAULT_PROVIDERS
): { provider: Provider; id: string } | null {
  return pickProvider(url, providers);
}

/* ----------------------- transformer ----------------------- */

const remarkEmbeds: Plugin<[RemarkEmbedsOptions?], Root> = (options = {}) => {
  const providers = options.providers ?? DEFAULT_PROVIDERS;
  const rewriteBareUrls = options.rewriteBareUrls ?? true;
  const rewriteNativeMedia = options.rewriteNativeMedia ?? true;
  return (tree: Root) => {
    // Walk paragraphs first (bare-URL author syntax). We replace them with
    // an `html` node and `[SKIP, idx + 1]` so the walker doesn't re-recurse.
    visit(tree, "paragraph", (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== "number") return;
      if (!rewriteBareUrls) return;
      const url = paragraphAsUrl(node);
      if (!url) return;
      const html = urlToFigure(url, "", providers, rewriteNativeMedia);
      if (!html) return;
      // T1-3: cast the children array once (as `unknown[]`) and drop
      // the per-assignment `as unknown as Paragraph`. The replacement
      // IS an `Html` node, which is structurally a valid mdast node;
      // `parent.children` is typed as a literal-union so we widen the
      // assignment slot, not the runtime payload.
      const parentChildren = parent.children as unknown[];
      parentChildren[index] = {
        type: "html",
        value: html + "\n",
      };
      return [SKIP, index + 1];
    });
    // Walk links whose target is a provider URL. We leave plain links that
    // don't match untouched, so users can still link to docs / articles.
    //
    // We use `visitParents` here (instead of plain `visit`) so we have the
    // full ancestor chain available — that's how we splice a lone `[link]`
    // paragraph up to its grandparent, eliminating the stray empty
    // `<p></p>` the `[label](url "title")` syntax would otherwise leave
    // next to the figure.
    visitParents(
      // T1-3 follow-up: the previous shape used
      // `tree as unknown as Parameters<typeof visitParents>[0]` to
      // bridge a mdast/unist type-package mismatch. Annotating the
      // transformer's `tree` parameter as `Root` (mdast) lets the
      // `visitParents<Tree extends UnistNode>` generic accept `Root`
      // directly — `mdast.Root` IS a `unist.Node` (Root <: Parent <:
      // Node) so the constraint is satisfied without any cast.
      tree,
      "link",
      (node: Link, ancestors) => {
        const url = node.url;
        if (!url || !isAbsoluteUrl(url)) return;
        const html = urlToFigure(
          url,
          node.title ?? "",
          providers,
          rewriteNativeMedia
        );
        if (!html) return;
        const replacement: unknown = {
          type: "html",
          value: html + "\n",
        };
        // ancestors = [..., rootNode, parent, link] (link not in the array
        // itself; the callback receives ancestors excluding the matched node)
        const parentRaw = ancestors[ancestors.length - 1];
        if (!parentRaw || typeof parentRaw !== "object") return;
        const parent = parentRaw as {
          type?: string;
          children?: unknown[];
        };
        const grandchildren = parent.children as unknown[] | undefined;
        // Only convert links that stand alone as the sole child of their
        // paragraph. If the link is the *only* child, splice the html node
        // up to the grandparent so the rendered DOM doesn't show a stray
        // empty `<p></p>` next to the figure. Mid-sentence provider links
        // (e.g. `see [this talk](https://youtu.be/x) for context`) are left
        // as ordinary links so the prose isn't destroyed.
        if (
          parent.type === "paragraph" &&
          Array.isArray(grandchildren) &&
          grandchildren.length === 1
        ) {
          const grandRaw = ancestors[ancestors.length - 2];
          if (grandRaw && typeof grandRaw === "object") {
            const grand = grandRaw as { children?: unknown[] };
            const grandChildren = grand.children;
            if (Array.isArray(grandChildren)) {
              const idxInGrand = grandChildren.indexOf(parentRaw as unknown);
              if (idxInGrand >= 0) {
                grandChildren[idxInGrand] = replacement;
                return [VP_SKIP, idxInGrand + 1];
              }
            }
          }
        }
        // Link is inside a paragraph with other text — leave it as an
        // ordinary link rather than destroying the sentence with a
        // block-level figure. Authors use `[label](url)`-on-its-own-line
        // syntax for standalone embeds.
      }
    );
  };
};

export default remarkEmbeds;
