import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkEmbeds from "@/utils/remarkEmbeds";

/**
 * Drive the plugin through the full mdast → hast → html pipeline so we
 * assert on the rendered HTML the same way the rest of the build will.
 * Mirrors the pattern in `__tests__/remarkRetina.test.ts`.
 *
 * `allowDangerousHtml: true` on `rehype-stringify` (not `remark-rehype`)
 * mirrors what Astro's pipeline does — it's the stringify step that emits
 * the raw HTML inside `html`/hast `raw` nodes, not the remark→rehype step.
 * Without it the rendered output escapes every `<` to `&#x3C;`.
 */
async function run(md: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkEmbeds)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true });
  const file = await processor.process(md);
  return String(file);
}

describe("remarkEmbeds — providers", () => {
  it("rewrites a bare YouTube watch URL into a youtube embed", async () => {
    const out = await run(
      "Watch this:\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n"
    );
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(out).toContain('loading="lazy"');
    expect(out).toContain("allowfullscreen");
  });

  it("accepts youtu.be short links", async () => {
    const out = await run("https://youtu.be/dQw4w9WgXcQ\n");
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("accepts YouTube embed/shorts/live URLs", async () => {
    const out = await run("https://www.youtube.com/shorts/abc123XYZ\n");
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toContain("abc123XYZ");
  });

  it("accepts www.youtube-nocookie.com embed URLs (mirrors the privacy URL the renderer itself emits)", async () => {
    const out = await run(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ\n"
    );
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toContain("dQw4w9WgXcQ");
  });

  it("accepts bare youtube-nocookie.com embed URLs", async () => {
    const out = await run("https://youtube-nocookie.com/embed/dQw4w9WgXcQ\n");
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toContain("dQw4w9WgXcQ");
  });

  it("rewrites Vimeo URLs into a vimeo embed iframe", async () => {
    const out = await run("https://vimeo.com/76979871\n");
    expect(out).toMatch(/<figure[^>]*data-embed="vimeo"/);
    expect(out).toContain("player.vimeo.com/video/76979871");
  });

  it("rewrites Loom share URLs", async () => {
    const out = await run("https://www.loom.com/share/abc12345\n");
    expect(out).toMatch(/<figure[^>]*data-embed="loom"/);
    expect(out).toContain("loom.com/embed/abc12345");
  });

  it("rewrites Bilibili URLs", async () => {
    const out = await run("https://www.bilibili.com/video/BV1xx411c7mD\n");
    expect(out).toMatch(/<figure[^>]*data-embed="bilibili"/);
    expect(out).toContain("BV1xx411c7mD");
  });

  it("rewrites Twitch video URLs", async () => {
    const out = await run("https://www.twitch.tv/videos/123456789\n");
    expect(out).toMatch(/<figure[^>]*data-embed="twitch"/);
    expect(out).toContain("video=123456789");
    // Twitch accepts multiple `parent=` query parameters — one per
    // allowed embed host. We pin the production host (from config)
    // and `localhost` so dev previews work too. A regression that
    // emits a single `parent=` would still pass `video=` so we
    // assert the dual-parent shape explicitly. `setup.ts` mocks
    // `astro-paper.config` with `site.url = "https://example.com/"`,
    // so the production-host assertion matches `example.com` here.
    expect(out).toMatch(/parent=example\.com/);
    expect(out).toMatch(/parent=localhost/);
  });

  it("rewrites SoundCloud URLs", async () => {
    const out = await run("https://soundcloud.com/example/track-name\n");
    expect(out).toMatch(/<figure[^>]*data-embed="soundcloud"/);
    expect(out).toContain("w.soundcloud.com/player/");
  });

  it("rewrites Spotify URLs", async () => {
    const out = await run("https://open.spotify.com/episode/0Z9k1sEXAMPLE\n");
    expect(out).toMatch(/<figure[^>]*data-embed="spotify"/);
    expect(out).toContain("open.spotify.com/embed/episode/");
  });

  it("leaves provider links inside regular paragraphs as ordinary links (only stand-alone links become embeds)", async () => {
    const out = await run(
      "Check this clip: [demo](https://youtu.be/dQw4w9WgXcQ)\n"
    );
    // Mid-sentence provider links remain as <a> rather than being
    // replaced by a block-level <figure> that would break the paragraph.
    expect(out).not.toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toMatch(/<a href="https:\/\/youtu\.be\/dQw4w9WgXcQ">demo<\/a>/);
  });
});

describe("remarkEmbeds — native media", () => {
  it("rewrites a bare .mp3 URL into an <audio> figure", async () => {
    const out = await run("https://example.com/speech.mp3\n");
    expect(out).toMatch(/<figure[^>]*data-embed="audio"/);
    expect(out).toContain("<audio");
    expect(out).toContain("controls");
    expect(out).toContain('preload="metadata"');
    expect(out).toContain('src="https://example.com/speech.mp3"');
  });

  it("rewrites a bare .mp4 URL into a <video> figure", async () => {
    const out = await run("https://example.com/clip.mp4\n");
    expect(out).toMatch(/<figure[^>]*data-embed="video"/);
    expect(out).toContain("<video");
    expect(out).toContain("<source");
  });

  it("handles query strings on native URLs", async () => {
    const out = await run("https://example.com/clip.mp4?token=abc&v=2\n");
    expect(out).toMatch(/<figure[^>]*data-embed="video"/);
    expect(out).toContain("token=abc");
  });
});

describe("remarkEmbeds — passthrough", () => {
  it("leaves non-provider URLs in plain paragraphs untouched", async () => {
    const md = "See https://example.com/about for context.\n";
    const out = await run(md);
    expect(out).not.toContain("data-embed");
    expect(out).toContain("https://example.com/about");
  });

  it("leaves non-provider bare URLs on their own line untouched", async () => {
    const out = await run("https://example.com/some-blog-post\n");
    expect(out).not.toContain("data-embed");
    expect(out).toContain("https://example.com/some-blog-post");
  });

  it("leaves an unknown extension untouched", async () => {
    const out = await run("https://example.com/file.zip\n");
    expect(out).not.toContain("data-embed");
  });

  it("leaves a paragraph with surrounding text alone", async () => {
    const md = "Intro sentence. https://youtu.be/dQw4w9WgXcQ trailing.\n";
    const out = await run(md);
    expect(out).not.toContain("data-embed");
  });

  it("leaves malformed YouTube URLs alone", async () => {
    const out = await run("https://youtube.com/watch?garbage=1\n");
    expect(out).not.toContain("data-embed");
  });
});

describe("remarkEmbeds — titles and captions", () => {
  it("honours markdown title on links as a figcaption", async () => {
    const md = '[Watch this](https://youtu.be/dQw4w9WgXcQ "Demo video")\n';
    const out = await run(md);
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
    expect(out).toContain("<figcaption>Demo video</figcaption>");
  });

  it("does not leave a stray empty <p> when rewriting a lone link", async () => {
    // `![foo](url)` style paragraphs are handled by the paragraph visitor.
    // `[foo](url)` style (a single link as the only child of a paragraph)
    // also collapses the paragraph, so the figure sits at root level
    // without an empty `<p></p>` left over next to it.
    const md = '[Demo](https://youtu.be/dQw4w9WgXcQ "Demo")\n';
    const out = await run(md);
    expect(out).not.toMatch(/<p>\s*<\/p>/);
    expect(out).toMatch(/<figure[^>]*data-embed="youtube"/);
  });

  it("escapes HTML in figcaptions", async () => {
    const md =
      '[Watch](https://youtu.be/dQw4w9WgXcQ "<script>alert(1)</script>")\n';
    const out = await run(md);
    expect(out).toContain("<figcaption>");
    expect(out).not.toContain("<script>alert(1)</script>");
  });
});

describe("remarkEmbeds — options", () => {
  it("respects `rewriteBareUrls: false`", async () => {
    const md = "https://youtu.be/dQw4w9WgXcQ\n";
    const out = await run(md);
    // smoke-check we still get an embed on default options
    expect(out).toMatch(/data-embed="youtube"/);
    const customProcessor = unified()
      .use(remarkParse)
      .use(remarkEmbeds, { rewriteBareUrls: false })
      .use(remarkRehype)
      .use(rehypeStringify, { allowDangerousHtml: true });
    const file = await customProcessor.process(md);
    const customOut = String(file);
    expect(customOut).not.toContain("data-embed");
  });

  it("respects `rewriteNativeMedia: false`", async () => {
    const customProcessor = unified()
      .use(remarkParse)
      .use(remarkEmbeds, { rewriteNativeMedia: false })
      .use(remarkRehype)
      .use(rehypeStringify, { allowDangerousHtml: true });
    const file = await customProcessor.process(
      "https://example.com/speech.mp3\n"
    );
    const out = String(file);
    expect(out).not.toContain("data-embed");
  });
});
