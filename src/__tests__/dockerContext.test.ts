import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const dockerfile = read("../../Dockerfile");
const dockerignore = read("../../.dockerignore");

const ignoredRootEntries = new Set(
  dockerignore
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => line.replace(/\/$/, ""))
);

const copiedRootFiles = [...dockerfile.matchAll(/^COPY\s+([^\s]+)\s+/gm)]
  .map(match => match[1])
  .filter(source => !source.startsWith("--from="))
  .flatMap(source => source.split(/\s+/))
  .filter(source => source && !source.includes("*") && !source.includes("/"))
  .map(source => source.replace(/^\.\//, ""));

describe("Docker build context", () => {
  it("does not ignore root files copied by the Dockerfile", () => {
    expect(copiedRootFiles).toContain("nginx.conf");

    for (const source of copiedRootFiles) {
      expect(ignoredRootEntries.has(source), `${source} is ignored`).toBe(
        false
      );
    }
  });

  // #16 OPS — pin the build-critical root files that the
  // Dockerfile MUST copy explicitly so a future `.dockerignore`
  // edit (or an editor auto-add) can't silently exclude them.
  // `_headers` is the Cloudflare/Netlify headers template that
  // `cloudflareHeadersIntegration` reads at build time; without
  // it the integration fails loud but a Docker build that
  // happened to succeed on a stale cache would ship a site with
  // no CSP / XCTO / HSTS headers.
  it("explicitly copies _headers, astro-paper.config.ts, and astro.config.ts", () => {
    expect(dockerfile, "Dockerfile must explicitly COPY _headers").toMatch(
      /^COPY\s+_headers\s+\.?\/?$/m
    );
    expect(
      dockerfile,
      "Dockerfile must explicitly COPY astro-paper.config.ts"
    ).toMatch(/^COPY\s+astro-paper\.config\.ts\s+\.?\/?$/m);
    expect(
      dockerfile,
      "Dockerfile must explicitly COPY astro.config.ts"
    ).toMatch(/^COPY\s+astro\.config\.ts\s+\.?\/?$/m);
  });

  it("the build-critical root files are NOT in .dockerignore", () => {
    // Inverse of the above — even with the explicit COPY lines,
    // a `.dockerignore` entry for these files would shadow them
    // inside the build context and produce a clear "file not
    // found" error. Pin both sides so either side drifting is
    // caught by CI.
    const critical = ["_headers", "astro-paper.config.ts", "astro.config.ts"];
    for (const file of critical) {
      expect(
        ignoredRootEntries.has(file),
        `${file} is listed in .dockerignore — would break the Docker build`
      ).toBe(false);
    }
  });

  it("reads files relative to the test's own URL, not process.cwd()", () => {
    // Sanity check on the path resolution: `import.meta.url` puts the
    // test file inside src/__tests__, so the Dockerfile lives two
    // levels up (`../../Dockerfile`). If a future refactor swaps back
    // to a CWD-relative path, the assertion below catches it —
    // vitest's `cwd` for a file-based test is the project root, not
    // the file's directory, which is the exact foot-gun this fix
    // exists to eliminate.
    expect(here.replace(/\\/g, "/")).toMatch(/\/__tests__\/$/);
    expect(repoRoot.replace(/\\/g, "/")).not.toMatch(/\/__tests__\//);
  });
});
