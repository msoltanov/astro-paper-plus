import { describe, expect, it } from "vitest";
import {
  pngBody,
  postOgImageFallback,
  readFontData,
} from "@/utils/postOgImage";
import {
  FONT_REGULAR_BYTES,
  FONT_BOLD_BYTES,
} from "@/utils/fontBytes.generated";

const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("postOgImage font bytes — T0-2 embedded-bytes contract", () => {
  it("FONTS_REGULAR_BYTES + FONT_BOLD_BYTES start with the expected TTF/true/OTTO magic prefix", () => {
    // T0-2: the vendored TTFs are now embedded as ArrayBuffers inside
    // `src/utils/fontBytes.generated.ts` (regenerated from
    // `src/assets/fonts/*.ttf` via `scripts/generate-font-bytes.mjs`).
    // The `assertTtfMagic` check inside `readFontData()` (deferred
    // to first render — see `fontBytesValidated` in postOgImage.ts)
    // throws if these are malformed, so the OG endpoints' try/catch
    // routes to `postOgImageFallback()` instead of hard-failing the
    // build. This test pins the magic prefixes so any future
    // regenerate that somehow re-encoded the bytes (e.g. lossily)
    // is caught directly, independent of the runtime check.
    const reg = new Uint8Array(FONT_REGULAR_BYTES);
    const bold = new Uint8Array(FONT_BOLD_BYTES);
    expect([reg[0], reg[1], reg[2], reg[3]]).toEqual([0x00, 0x01, 0x00, 0x00]);
    expect([bold[0], bold[1], bold[2], bold[3]]).toEqual([
      0x00, 0x01, 0x00, 0x00,
    ]);
    expect(FONT_REGULAR_BYTES.byteLength).toBeGreaterThan(1000);
    expect(FONT_BOLD_BYTES.byteLength).toBeGreaterThan(1000);
    expect(FONT_REGULAR_BYTES.byteLength).not.toBe(FONT_BOLD_BYTES.byteLength);
  });

  it("readFontData returns the embedded regular + bold bytes by reference", () => {
    // The whole point of T0-2: `readFontData` no longer reads from
    // disk via `fs.readFileSync` (which broke under Vite's prerender
    // chunk bundling — the relative `import.meta.url` resolved to a
    // nonexistent `dist/.prerender/assets/fonts/X.ttf`). It now
    // returns the statically-embedded bytes.
    const data = readFontData();
    expect(data.regular).toBe(FONT_REGULAR_BYTES);
    expect(data.bold).toBe(FONT_BOLD_BYTES);
  });
});

describe("postOgImage fallback", () => {
  it("returns the valid 1x1 PNG byte shape rejected by check-og", async () => {
    const response = postOgImageFallback();
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...bytes.slice(0, pngMagic.length)]).toEqual(pngMagic);
    expect(bytes.byteLength).toBeLessThan(1024);
    expect(bytes[12]).toBe(0x49);
    expect(bytes[13]).toBe(0x48);
    expect(bytes[14]).toBe(0x44);
    expect(bytes[15]).toBe(0x52);
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(1);
    expect(new DataView(bytes.buffer).getUint32(20)).toBe(1);
  });

  it("copies PNG bytes into a standalone ArrayBuffer", () => {
    const input = Uint8Array.from(pngMagic);
    const output = pngBody(input);

    expect([...new Uint8Array(output)]).toEqual(pngMagic);
    expect(output).not.toBe(input.buffer);
  });
});
