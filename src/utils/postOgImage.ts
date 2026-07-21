/**
 * `renderPostOgPng` — shared dynamic-OG-image generator for post detail
 * pages (default-locale + per-locale). Used by:
 *
 *   - `src/pages/posts/[...slug]/index.png.ts`             (default locale)
 *   - `src/pages/[locale]/posts/[...slug]/index.png.ts`   (per locale)
 *
 * Renders a 1200×630 Satori SVG anchored to the same visual layout
 * (corner inset, centred title, byline + site title at the bottom).
 * Uses Sharp to convert the SVG to PNG.
 *
 * Font loading uses the vendored TTF bytes embedded into
 * `src/utils/fontBytes.generated.ts` (regenerated via
 * `node scripts/generate-font-bytes.mjs` from `src/assets/fonts/`).
 * The previous `import.meta.url`-relative path resolution worked in
 * vitest / dev (where the helper's source location survives bundling)
 * but BROKE in `astro build`'s prerender output: each endpoint bundle
 * is emitted under `dist/.prerender/chunks/` and the relative URL
 * resolved to `dist/.prerender/assets/fonts/X.ttf`, which doesn't
 * exist (Vite's asset pipeline doesn't copy files consumed via
 * `fs.readFileSync`). Shipping the bytes inside the bundle eliminates
 * the path-resolution problem entirely. See issues.md T0-2.
 */
import satori from "satori";
import sharp from "sharp";
import {
  OG_WIDTH,
  OG_HEIGHT,
  OG_FALLBACK_CACHE_CONTROL,
  EMPTY_PNG_BASE64,
} from "./ogConstants";
import { FONT_REGULAR_BYTES, FONT_BOLD_BYTES } from "./fontBytes.generated";

const POST_OG_WIDTH = OG_WIDTH;
const POST_OG_HEIGHT = OG_HEIGHT;

type RenderArgs = {
  title: string;
  author: string;
  siteTitle: string;
  description?: string;
};

/**
 * L6: `buildSiteOgTree` — the Satori VNode for the site-level OG
 * image used by `/og.png` (default locale) and `/<locale>/og.png`
 * (per-locale). Hoisted here next to `buildPostOgTree` so the two
 * site-level endpoints can't drift out of sync — historically the
 * VNode was duplicated in both `src/pages/og.png.ts` and
 * `src/pages/[locale]/og.png.ts` with no enforced parity.
 *
 * The text content is supplied by the caller (the locale-aware
 * translation layer in `src/i18n/lang/<locale>.ts`) so the per-locale
 * endpoint can ship RU/TR copy on a `/ru/` URL without baking a
 * specific locale into this helper.
 */
export function buildSiteOgTree(args: {
  title: string;
  description: string;
  hostname: string;
}): unknown {
  return {
    type: "div",
    props: {
      style: {
        background: "#fefbfb",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Google Sans Code",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "-1px",
              right: "-1px",
              border: "4px solid #000",
              background: "#ecebeb",
              opacity: "0.9",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "center",
              margin: "2.5rem",
              width: "88%",
              height: "80%",
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              border: "4px solid #000",
              background: "#fefbfb",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "center",
              margin: "2rem",
              width: "88%",
              height: "80%",
            },
            children: {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  margin: "20px",
                  width: "90%",
                  height: "90%",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "90%",
                        maxHeight: "90%",
                        overflow: "hidden",
                        textAlign: "center",
                      },
                      children: [
                        {
                          type: "p",
                          props: {
                            style: { fontSize: 72, fontWeight: "bold" },
                            children: args.title,
                          },
                        },
                        {
                          type: "p",
                          props: {
                            style: { fontSize: 28 },
                            children: args.description,
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "flex-end",
                        width: "100%",
                        marginBottom: "8px",
                        fontSize: 28,
                      },
                      children: {
                        type: "span",
                        props: {
                          style: { overflow: "hidden", fontWeight: "bold" },
                          children: args.hostname,
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };
}

/**
 * Site-level fallback OG render. Same font / size contract as the
 * post-OG endpoint so the two image shapes look like siblings. Returns
 * a `Uint8Array` of PNG bytes — caller wraps in the right `Response`
 * shape for the route handler.
 *
 * L6: lifted here so `src/pages/og.png.ts` and
 * `src/pages/[locale]/og.png.ts` share one tree and one renderer.
 */
export async function renderSiteOgPng(args: {
  title: string;
  description: string;
  hostname: string;
}): Promise<Uint8Array> {
  const fonts = readFontData();
  const svg = await satori(buildSiteOgTree(args), {
    width: POST_OG_WIDTH,
    height: POST_OG_HEIGHT,
    embedFont: true,
    fonts: [
      {
        name: "Google Sans Code",
        data: fonts.regular,
        weight: 400,
        style: "normal",
      },
      {
        name: "Google Sans Code",
        data: fonts.bold,
        weight: 700,
        style: "normal",
      },
    ],
  });
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * Validate the vendored font bytes have a valid TTF magic-byte prefix.
 * Belt-and-braces guard — the bytes are pre-validated at
 * generate-font-bytes.mjs time (the script reads from the source
 * `.ttf` files which themselves have known-good magic), but a future
 * contributor who hand-edits `fontBytes.generated.ts` would bypass
 * the script and ship a corrupt font without a loud failure.
 *
 * Deferred until first `readFontData()` call (lazy, runs once per
 * module instance) instead of at module-import time. The OG route
 * handlers (`src/pages/og.png.ts`, `src/pages/[locale]/og.png.ts`,
 * and the per-post endpoints) wrap their render calls in
 * `try { ... } catch { return postOgImageFallback() }`. If the
 * assertion fired at module import, the throw would happen
 * BEFORE that try/catch could see it — the build would hard-fail
 * instead of degrading to the empty 1×1 PNG. By validating lazily
 * inside `readFontData()`, the throw now occurs inside the render
 * path's try block and the fallback contract is preserved.
 */
function assertTtfMagic(label: string, bytes: Uint8Array): void {
  const b = bytes;
  const isTtf =
    (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) ||
    (b[0] === 0x74 && b[1] === 0x72 && b[2] === 0x75 && b[3] === 0x65) ||
    (b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f);
  if (!isTtf) {
    throw new Error(
      `[postOgImage] vendored font bytes are not a valid TTF (magic mismatch): ${label}`
    );
  }
}

/** One-shot guard so the magic-byte check runs exactly once per
 * module instance — first `readFontData()` call validates, subsequent
 * calls skip the check. Module-scoped (not exported) so vitest's
 * `vi.resetModules()` correctly resets the flag alongside the
 * byte references. */
let fontBytesValidated = false;

/**
 * Re-export the embedded vendored font bytes under the same shape
 * `renderSiteOgPng` / `renderPostOgPng` consume. Satori accepts
 * `ArrayBuffer` directly for `font.data`; the lazy TTF-magic check
 * inside this function (see `fontBytesValidated` above) guarantees
 * the magic bytes are present so a corrupt font never reaches the
 * renderer.
 *
 * Wrapped in an object so the call-site contract (`{regular, bold}`)
 * stays identical to the previous disk-read version — the swap from
 * `node:fs.readFileSync` to inlined bytes is invisible to consumers.
 */
export function readFontData(): { regular: ArrayBuffer; bold: ArrayBuffer } {
  if (!fontBytesValidated) {
    assertTtfMagic("regular", new Uint8Array(FONT_REGULAR_BYTES));
    assertTtfMagic("bold", new Uint8Array(FONT_BOLD_BYTES));
    fontBytesValidated = true;
  }
  return {
    regular: FONT_REGULAR_BYTES,
    bold: FONT_BOLD_BYTES,
  };
}

/** Test-only escape hatch kept for back-compat with prior test code.
 * No-op now that font bytes are statically embedded; the exported
 * identity is identical across calls so callers (incl. vitest module
 * resets) don't need to invalidate anything. */
export function __resetFontCacheForTesting(): void {
  // intentionally empty
}

/** Re-export so downstream consumers (other utils, future overrides)
 * can still reach the embedded bytes directly without re-implementing
 * the atob + Uint8Array dance. */
export { FONT_REGULAR_BYTES, FONT_BOLD_BYTES };

/**
 * Build the Satori-friendly VNode for the post OG image. Pure function;
 * kept separate so the template stays readable in version diffs.
 */
function buildPostOgTree(args: RenderArgs) {
  return {
    type: "div",
    props: {
      style: {
        background: "#fefbfb",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "-1px",
              right: "-1px",
              border: "4px solid #000",
              background: "#ecebeb",
              opacity: "0.9",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "center",
              margin: "2.5rem",
              width: "88%",
              height: "80%",
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              border: "4px solid #000",
              background: "#fefbfb",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "center",
              margin: "2rem",
              width: "88%",
              height: "80%",
            },
            children: {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  margin: "20px",
                  width: "90%",
                  height: "90%",
                },
                children: [
                  {
                    type: "p",
                    props: {
                      style: {
                        fontSize: 72,
                        fontWeight: "bold",
                        maxHeight: "84%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      },
                      children: args.title,
                    },
                  },
                  ...(args.description
                    ? [
                        {
                          type: "p",
                          props: {
                            style: {
                              fontSize: 24,
                              maxHeight: "12%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              marginTop: "12px",
                            },
                            children: args.description,
                          },
                        },
                      ]
                    : []),
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        marginBottom: "8px",
                        fontSize: 28,
                      },
                      children: [
                        {
                          type: "span",
                          props: {
                            children: [
                              "by ",
                              {
                                type: "span",
                                props: {
                                  style: { color: "transparent" },
                                  children: '"',
                                },
                              },
                              {
                                type: "span",
                                props: {
                                  style: {
                                    overflow: "hidden",
                                    fontWeight: "bold",
                                  },
                                  children: args.author,
                                },
                              },
                            ],
                          },
                        },
                        {
                          type: "span",
                          props: {
                            style: {
                              overflow: "hidden",
                              fontWeight: "bold",
                            },
                            children: args.siteTitle,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };
}

/**
 * Render the PNG body for a post's dynamic OG image. Throws on font
 * load failure — failures are deterministic (missing or malformed
 * vendored TTFs), so a loud build failure is preferable to shipping
 * empty-1×1 PNG fallbacks that hide the regression from crawlers.
 */
export async function renderPostOgPng(args: RenderArgs): Promise<Uint8Array> {
  const fonts = readFontData();

  const svg = await satori(buildPostOgTree(args), {
    width: POST_OG_WIDTH,
    height: POST_OG_HEIGHT,
    embedFont: true,
    fonts: [
      {
        name: "Google Sans Code",
        data: fonts.regular,
        weight: 400,
        style: "normal",
      },
      {
        name: "Google Sans Code",
        data: fonts.bold,
        weight: 700,
        style: "normal",
      },
    ],
  });
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * Standard 404 fallback the post-OG endpoints emit when fonts fail.
 * The empty-body response with `Content-Type: image/png` is what
 * upstream `src/pages/og.png.ts` does — kept identical so consumer
 * crawlers get the same shape regardless of which endpoint they hit.
 */
export function postOgImageFallback(): Response {
  const emptyPng = Buffer.from(EMPTY_PNG_BASE64, "base64");
  return new Response(new Uint8Array(emptyPng), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": OG_FALLBACK_CACHE_CONTROL,
    },
  });
}

/**
 * Convert a PNG `Uint8Array` to a `BodyInit`-compatible `ArrayBuffer`.
 *
 * Node's runtime accepts `Uint8Array` / `Buffer` as fetch `BodyInit`,
 * but some strict TypeScript lib configurations flag the DOM
 * `BodyInit` overload against those types even though the runtime
 * works fine. The cleanest cross-lib typing is to copy the bytes into
 * a fresh `ArrayBuffer`.
 */
export function pngBody(png: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(png.byteLength);
  new Uint8Array(out).set(png);
  return out;
}
