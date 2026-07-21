import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { AstroIntegration } from "astro";
import {
  sitemapIntegration,
  resolvePageLastmod,
  setCapturedPostsForTesting,
} from "@/integrations/sitemap";

type BuildSetupHook = NonNullable<
  AstroIntegration["hooks"]["astro:build:setup"]
>;
type BuildDoneHook = NonNullable<AstroIntegration["hooks"]["astro:build:done"]>;

const tempDirs: string[] = [];

function makeFixture(): { contentDir: string; distDir: string } {
  const root = join(process.cwd(), ".tmp-sitemap-integration-test");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "content", "posts", "en"), { recursive: true });
  mkdirSync(join(root, "content", "posts", "ru"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  const post = `---
pubDatetime: 2026-01-02T12:00:00Z
modDatetime: 2026-01-03T12:00:00Z
---

# Fixture
`;
  writeFileSync(join(root, "content", "posts", "en", "fixture.md"), post);
  writeFileSync(join(root, "content", "posts", "ru", "fixture.md"), post);
  tempDirs.push(root);
  return {
    contentDir: join(root, "content"),
    distDir: join(root, "dist"),
  };
}

function writePage(distDir: string, pathname: string): void {
  const relativePath = pathname.replace(/^\//, "").replace(/\/$/, "");
  const directory = relativePath ? join(distDir, relativePath) : distDir;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.html"), "<!doctype html><html></html>");
}

afterEach(() => {
  setCapturedPostsForTesting(null);
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("sitemapIntegration", () => {
  it("loads posts, merges chunks, emits hreflang, and stamps page lastmod", async () => {
    const { contentDir, distDir } = makeFixture();
    const pages = [
      { pathname: "" },
      { pathname: "about/" },
      { pathname: "ru/about/" },
      { pathname: "posts/fixture/" },
      { pathname: "ru/posts/fixture/" },
    ];
    for (const page of pages) writePage(distDir, page.pathname);
    const expectedPageLastmod = resolvePageLastmod("1780272000");
    const previousEpoch = process.env.SOURCE_DATE_EPOCH;
    process.env.SOURCE_DATE_EPOCH = "1780272000";

    const integration = sitemapIntegration({
      baseUrl: "https://example.test/",
      defaultTimezone: "UTC",
      contentDir,
    });
    if (previousEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = previousEpoch;
    const logger = {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
    };
    const setup = integration.hooks["astro:build:setup"] as BuildSetupHook;
    setup({
      logger,
    } as unknown as Parameters<BuildSetupHook>[0]);
    const done = integration.hooks["astro:build:done"] as BuildDoneHook;
    await done({
      dir: pathToFileURL(`${distDir}/`),
      pages,
      logger,
    } as unknown as Parameters<BuildDoneHook>[0]);

    const postsXml = readFileSync(join(distDir, "sitemap-posts-0.xml"), "utf8");
    const pagesXml = readFileSync(join(distDir, "sitemap-pages-0.xml"), "utf8");
    const indexXml = readFileSync(join(distDir, "sitemap-index.xml"), "utf8");

    expect(existsSync(join(distDir, "sitemap-posts-0.xml"))).toBe(true);
    expect(existsSync(join(distDir, "sitemap-pages-0.xml"))).toBe(true);
    expect(existsSync(join(distDir, "sitemap-index.xml"))).toBe(true);
    expect(postsXml.match(/<url>/g)).toHaveLength(2);
    expect(postsXml.match(/hreflang="en"/g)).toHaveLength(2);
    expect(postsXml.match(/hreflang="ru"/g)).toHaveLength(2);
    expect(postsXml.match(/hreflang="x-default"/g)).toHaveLength(2);
    expect(pagesXml.match(/<url>/g)).toHaveLength(3);
    expect(pagesXml.match(/hreflang="x-default"/g)).toHaveLength(3);
    expect(pagesXml).toContain(expectedPageLastmod);
    expect(indexXml.match(/<sitemap>/g)).toHaveLength(2);
    expect(indexXml.match(/<lastmod>/g)).toHaveLength(2);
  });
});
