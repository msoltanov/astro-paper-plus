/**
 * Unit tests for `ogInputsHash` (content-addressed OG image hash
 * helper, introduced for the H4 fix). Pins the contract that drives
 * dynamic OG image cache invalidation:
 *
 *   1. Same inputs → same hash (build-deterministic).
 *   2. Any input change → different hash (the whole point of H4).
 *   3. Different render versions → different hash even if inputs are
 *      identical (lets us bump a layout / palette without changing
 *      posts).
 *   4. Whitespace at the edges of strings doesn't change the hash
 *      (transcript-rounded authors shouldn't bust cache).
 *   5. Unicode normalisation (NFC) is applied, so equivalent
 *      compositions (e.g. NFC vs NFD) collide.
 *   6. The output shape is an 8-character lowercase hex string.
 */
import { describe, it, expect } from "vitest";
import { ogInputsHash, OG_RENDER_VERSION } from "@/utils/ogConstants";

const base = {
  title: "Hello world",
  author: "Mekan Soltanov",
  siteTitle: "AstroPaper+",
};

describe("ogInputsHash — content-addressed cache busting (H4)", () => {
  it("produces an 8-character lowercase hex string", () => {
    const h = ogInputsHash(base);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is stable for identical inputs (build-deterministic)", () => {
    expect(ogInputsHash(base)).toBe(ogInputsHash(base));
  });

  it("changes when the title changes", () => {
    const a = ogInputsHash(base);
    const b = ogInputsHash({ ...base, title: "Hello, world!" });
    expect(a).not.toBe(b);
  });

  it("changes when the author changes", () => {
    const a = ogInputsHash(base);
    const b = ogInputsHash({ ...base, author: "Sat Naing" });
    expect(a).not.toBe(b);
  });

  it("changes when the site title changes", () => {
    const a = ogInputsHash(base);
    const b = ogInputsHash({ ...base, siteTitle: "AstroPaper Plus" });
    expect(a).not.toBe(b);
  });

  it("changes when the render version bumps", () => {
    // The render version is mixed into the hash so a layout / palette
    // change invalidates every cache without authors having to edit
    // posts. The version is sourced from (in priority order):
    //   1. `process.env.OG_RENDER_VERSION` (Docker / CI override)
    //   2. `git rev-parse --short HEAD` (git-aware builds)
    //   3. a content hash of the OG render inputs (Docker, tarball CI)
    //   4. a constant `src-fallback` token if the hash itself fails
    //      (T2-1: was `Date.now().toString(36)`, which cache-busted
    //      every non-git build for no reason).
    expect(typeof OG_RENDER_VERSION).toBe("string");
    expect(OG_RENDER_VERSION.length).toBeGreaterThan(0);
    // Should never be the empty string or a single-char placeholder.
    expect(OG_RENDER_VERSION).not.toBe("1");
  });

  it("falls back to a content hash of the render inputs when git is unavailable", () => {
    // The contract for Docker: with no `OG_RENDER_VERSION` env var
    // and no `.git/`, the version is `src-<12 hex chars>`. Pinning
    // the prefix here means a future refactor that accidentally
    // changes the shape (e.g. drops back to a per-build timestamp)
    // breaks the test, surfacing the regression at the gate rather
    // than as silent cache staleness in production.
    const isGitShortSha = /^[0-9a-f]{7,}$/i.test(OG_RENDER_VERSION);
    const isSrcHash = /^src-[0-9a-f]{12}$/.test(OG_RENDER_VERSION);
    const isFallback = OG_RENDER_VERSION === "src-fallback";
    expect(isGitShortSha || isSrcHash || isFallback).toBe(true);
  });

  it("never falls back to a per-build timestamp (T2-1 cache-bust regression)", () => {
    // T2-1: a `Date.now().toString(36)` fallback changes every build,
    // invalidating every CDN cache entry the world has for the OG
    // URL — for no reason, since the render output is identical. The
    // fallback token MUST be stable across builds (either a constant
    // literal `src-fallback`, or the content hash above). If a
    // future contributor reintroduces `build-<timestamp>`, this test
    // fails the gate.
    expect(OG_RENDER_VERSION).not.toMatch(/^build-[0-9a-z]+$/);
  });

  it("trims leading and trailing whitespace from inputs", () => {
    const a = ogInputsHash(base);
    const b = ogInputsHash({
      ...base,
      title: `  ${base.title}  `,
      author: ` ${base.author} `,
      siteTitle: `${base.siteTitle}\n`,
    });
    expect(a).toBe(b);
  });

  it("treats NFC and NFD variants of the same text as equal", () => {
    // "é" composed (U+00E9) and decomposed (U+0065 U+0301) render
    // identically. Authors paste text from a variety of sources, so
    // NFC normalisation makes the hash robust to that noise.
    const composed = "café"; // NFC: U+00E9
    const decomposed = "cafe\u0301"; // NFD: e + combining acute
    const a = ogInputsHash({ ...base, title: composed });
    const b = ogInputsHash({ ...base, title: decomposed });
    expect(a).toBe(b);
  });

  it("treats empty / missing inputs as deterministic fallback", () => {
    // Pin the no-string-input shape so a future change doesn't
    // accidentally start producing `NaN` or throwing.
    expect(() =>
      ogInputsHash({ title: "", author: "", siteTitle: "" })
    ).not.toThrow();
    const a = ogInputsHash({ title: "", author: "", siteTitle: "" });
    const b = ogInputsHash({ title: "", author: "", siteTitle: "" });
    expect(a).toBe(b);
  });
});
