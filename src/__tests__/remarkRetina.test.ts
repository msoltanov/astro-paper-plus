import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkRetina from "@/utils/remarkRetina";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

/**
 * Tests run the plugin against a real markdown AST and assert on the emitted
 * raw HTML. We create tiny (200x100) PNG fixtures on disk so `sharp` can read
 * real dimensions without bundling image fixtures into the repo.
 */
const TMP_ROOT = path.join(
  os.tmpdir(),
  `remark-retina-test-${process.pid}-${Date.now()}`
);

async function writePng(
  absPath: string,
  width: number,
  height: number
): Promise<void> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 50, g: 200, b: 100 },
    },
  })
    .png()
    .toBuffer();
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
}

async function runPlugin(
  md: string,
  fileDir: string,
  patterns?: RegExp[]
): Promise<string> {
  // `remarkRetina` is async (it `await`s sharp + node:fs), so we must drive the
  // pipeline through `processor.process` (async) instead of `processSync`.
  // We run the full markdown → HAST → HTML pipeline because our plugin attaches
  // `hProperties` to mdast nodes; only the HAST→HTML serializer sees those.
  const processor = unified()
    .use(remarkParse)
    .use(remarkRetina, { patterns })
    .use(remarkRehype)
    .use(rehypeStringify);
  const file = await processor.process({
    value: md,
    path: path.join(fileDir, "post.md"),
  });
  return String(file);
}

beforeAll(async () => {
  // Fixtures: one "retina"-named PNG (should be halved) and one neutral PNG
  // (should be left alone).
  // markdown `![]()` image syntax requires URL-encoded paths for spaces, so
  // we mirror that here by writing the on-disk filename with literal spaces
  // and referencing it with the encoded form from markdown.
  await writePng(
    path.join(TMP_ROOT, "Screen Shot 2025-01-30 at 14.22.17.png"),
    800,
    400
  );
  await writePng(path.join(TMP_ROOT, "logo.png"), 400, 200);
  await writePng(path.join(TMP_ROOT, "icon@2x.png"), 96, 96);
  // NB: `missing@2x.png` is intentionally not created.
});

afterAll(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});

describe("remarkRetina", () => {
  it("halves width/height for macOS screencaptures", async () => {
    // Note: markdown `![]()` requires URL-encoded paths for spaces, so the
    // authored reference uses `%20`. The plugin decodes the URL to inspect the
    // real filename pattern AND to resolve the file on disk.
    const md =
      "![a screenshot](Screen%20Shot%202025-01-30%20at%2014.22.17.png)";
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).toContain('width="400"');
    expect(out).toContain('height="200"');
    expect(out).toContain('data-retina="halved"');
    expect(out).toContain('data-retina-reason="macOS screencapture"');
  });

  it("halves width/height for @2x convention", async () => {
    const md = "![an @2x asset](icon@2x.png)";
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).toContain('width="48"');
    expect(out).toContain('height="48"');
    expect(out).toMatch(/data-retina-reason="@2x convention"/);
  });

  // #38 — test the other retina conventions that ship in the
  // default pattern set. Both `_2x.` and `-2x.` are common
  // alternatives to `@2x.` in design systems that disallow `@`
  // in filenames; both must be halved and tagged with the
  // right `data-retina-reason`.
  it("halves width/height for _2x convention", async () => {
    await writePng(path.join(TMP_ROOT, "logo_2x.png"), 400, 200);
    const md = "![underscore 2x](logo_2x.png)";
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).toContain('width="200"');
    expect(out).toContain('height="100"');
    expect(out).toMatch(/data-retina-reason="_2x convention"/);
  });

  it("halves width/height for -2x convention", async () => {
    await writePng(path.join(TMP_ROOT, "logo-2x.png"), 400, 200);
    const md = "![hyphen 2x](logo-2x.png)";
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).toContain('width="200"');
    expect(out).toContain('height="100"');
    expect(out).toMatch(/data-retina-reason="_2x convention"/);
  });

  // #38 — multiple retina-marked images in one document. Each
  // image must be independently halved; the plugin must not
  // leak state between images (e.g. caching the first match
  // and reusing it for every subsequent visit).
  it("handles a mix of retina and non-retina images in one document", async () => {
    const md = [
      "![retina](icon@2x.png)",
      "![plain](logo.png)",
      "![another retina](Screen%20Shot%202025-01-30%20at%2014.22.17.png)",
    ].join("\n\n");
    const out = await runPlugin(md, TMP_ROOT);
    // The two retina images are halved; the plain logo is left alone.
    expect(out).toContain('width="48"'); // icon@2x → 96 → 48
    expect(out).toContain('height="48"');
    expect(out).toContain('width="400"'); // screencapture → 800 → 400
    expect(out).toContain('height="200"');
    // The plain logo keeps its natural dimensions (no data-retina).
    expect(out).toContain('src="logo.png"');
    // Two retina tags (one per matched image), not three.
    const retinaMatches = out.match(/data-retina="halved"/g) ?? [];
    expect(retinaMatches).toHaveLength(2);
  });

  // #38 — missing-suffix control: an image whose name doesn't
  // match any default pattern must NOT be touched. This is the
  // "do no harm" contract — only retina-convention images get
  // the data-retina attribute; plain images render as before.
  it("control: a non-retina filename with numeric digits in it is left alone", async () => {
    // `image-2026-01-30.png` has digits but no retina convention —
    // it should render WITHOUT a data-retina tag. The plugin
    // doesn't add width/height to non-matching images (those
    // images rely on the markdown author's HTML-level sizing or
    // the browser's intrinsic sizing), so we only assert on
    // the absence of `data-retina` rather than specific dimensions.
    await writePng(path.join(TMP_ROOT, "image-2026-01-30.png"), 300, 150);
    const md = "![dated image](image-2026-01-30.png)";
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).not.toContain("data-retina");
    expect(out).toContain("image-2026-01-30.png");
  });

  it("leaves non-matching images untouched", async () => {
    const md = "![our logo](logo.png)";
    const out = await runPlugin(md, TMP_ROOT);
    // Should NOT have been turned into raw HTML with `data-retina`.
    expect(out).not.toContain("data-retina");
    expect(out).toContain("logo.png");
  });

  it("honours a custom pattern override", async () => {
    const md = "![a logo with @2x in name](icon@2x.png)";
    const onlyMac = /@2x\./i;
    // pretend the user only cares about custom pattern
    void onlyMac; // silence unused
    const out = await runPlugin(md, TMP_ROOT, [
      /only-this-matches-nothing/,
      /@2x\./i,
    ]);
    expect(out).toContain('width="48"');
  });

  it("does not throw when the file is missing on disk", async () => {
    const md = "![missing](missing@2x.png)";
    // File is not on disk — plugin should silently skip without breaking build.
    await expect(runPlugin(md, TMP_ROOT)).resolves.not.toThrow();
  });

  it("preserves the alt text verbatim", async () => {
    const md = "![settings pane](icon@2x.png)";
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).toContain('alt="settings pane"');
  });

  it("preserves the title attribute when one is provided", async () => {
    const md = '![alt](icon@2x.png "Settings pane title")';
    const out = await runPlugin(md, TMP_ROOT);
    expect(out).toContain('title="Settings pane title"');
    expect(out).toContain('alt="alt"');
  });
});
