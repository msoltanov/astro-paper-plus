/**
 * Tests for `src/utils/getFontPathByWeight.ts`.
 *
 * The function takes Astro's virtual `FontData[]` type. We can't import
 * the real type without pulling in `astro:assets` (a virtual module),
 * so we structure-mock the input shape — only the fields the function
 * actually reads (`weight`, `style`, `src[].format`, `src[].url`).
 */
import { describe, it, expect } from "vitest";
import { getFontPathByWeight } from "@/utils/getFontPathByWeight";

type FontData = Parameters<typeof getFontPathByWeight>[0][number];

function makeFont(
  weight: number,
  style: "normal" | "italic",
  src: Array<{ format: string; url: string }>
): FontData {
  return {
    weight: String(weight),
    style,
    src,
  } as unknown as FontData;
}

describe("getFontPathByWeight", () => {
  it("returns the first matching src for the requested weight+style", () => {
    const fonts: FontData[] = [
      makeFont(400, "normal", [
        { format: "truetype", url: "/font-400-normal.ttf" },
        { format: "woff2", url: "/font-400-normal.woff2" },
      ]),
      makeFont(700, "normal", [
        { format: "truetype", url: "/font-700-normal.ttf" },
      ]),
    ];
    expect(getFontPathByWeight(fonts, 400)).toBe("/font-400-normal.ttf");
    expect(getFontPathByWeight(fonts, 700)).toBe("/font-700-normal.ttf");
  });

  it("defaults to style='normal' and format='truetype'", () => {
    const fonts: FontData[] = [
      makeFont(400, "normal", [{ format: "truetype", url: "/regular.ttf" }]),
    ];
    // No options → uses defaults.
    expect(getFontPathByWeight(fonts, 400)).toBe("/regular.ttf");
  });

  it("filters by style when provided", () => {
    const fonts: FontData[] = [
      makeFont(400, "normal", [{ format: "truetype", url: "/regular.ttf" }]),
      makeFont(400, "italic", [{ format: "truetype", url: "/italic.ttf" }]),
    ];
    expect(getFontPathByWeight(fonts, 400, { style: "italic" })).toBe(
      "/italic.ttf"
    );
    expect(getFontPathByWeight(fonts, 400, { style: "normal" })).toBe(
      "/regular.ttf"
    );
  });

  it("filters by format when provided", () => {
    const fonts: FontData[] = [
      makeFont(400, "normal", [
        { format: "truetype", url: "/regular.ttf" },
        { format: "woff2", url: "/regular.woff2" },
      ]),
    ];
    expect(getFontPathByWeight(fonts, 400, { format: "woff2" })).toBe(
      "/regular.woff2"
    );
  });

  it("falls back to src[0] when no src entry matches the format filter", () => {
    // If the caller asks for a format that isn't bundled, we still
    // return SOMETHING (the first src) rather than undefined — better
    // to ship a heavier format than a broken <link>.
    const fonts: FontData[] = [
      makeFont(400, "normal", [{ format: "truetype", url: "/regular.ttf" }]),
    ];
    expect(getFontPathByWeight(fonts, 400, { format: "woff2" })).toBe(
      "/regular.ttf"
    );
  });

  it("returns undefined when no font matches the weight", () => {
    const fonts: FontData[] = [
      makeFont(400, "normal", [{ format: "truetype", url: "/regular.ttf" }]),
    ];
    expect(getFontPathByWeight(fonts, 700)).toBeUndefined();
  });

  it("returns undefined when no font matches the style", () => {
    const fonts: FontData[] = [
      makeFont(400, "normal", [{ format: "truetype", url: "/regular.ttf" }]),
    ];
    expect(
      getFontPathByWeight(fonts, 400, { style: "italic" })
    ).toBeUndefined();
  });
});
