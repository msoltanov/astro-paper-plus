#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
// P3-59: probe file name is process-PID + random so two parallel
// invocations never collide (and we never overwrite a real
// `dist/_astro/<file>.js` if it happens to exist). The original
// `_astro/foo.js` collided if a real asset shared the stem.
const probeStem = `nginx-header-probe-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
const asset = resolve(dist, "_astro", `${probeStem}.js`);
const headersFile = resolve(dist, "nginx-headers.conf");
const container = `astro-paper-nginx-headers-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
// R16: pull the test nginx image from an env override so the test
// doesn't have to be edited every time the Dockerfile's NGINX_VERSION
// arg moves forward. CI passes `--build-arg NGINX_VERSION=<new>` to
// rebuild the image; the same env value should flow here. Default
// tracks the Dockerfile's pinned version.
const image = process.env.NGINX_TEST_IMAGE ?? "nginx:1.30.4-alpine";

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function fail(message) {
  throw new Error(`[test-nginx-headers] ${message}`);
}

const dockerInfo = docker(["info", "--format", "{{.ServerVersion}}"]);
if (dockerInfo.status !== 0) {
  if (process.env.CI) fail("Docker is required in CI");
  process.stdout.write("[test-nginx-headers] skipped: Docker is unavailable\n");
  process.exit(0);
}

if (!existsSync(headersFile)) {
  fail("dist/nginx-headers.conf is missing; run pnpm build:site first");
}

mkdirSync(dirname(asset), { recursive: true });
writeFileSync(
  asset,
  `export const nginxHeaderProbe = ${JSON.stringify("x".repeat(4096))};\n`
);

try {
  const run = docker([
    "run",
    "--rm",
    "-d",
    "--name",
    container,
    "-p",
    "127.0.0.1::80",
    "-v",
    `${resolve(root, "nginx.conf")}:/etc/nginx/conf.d/default.conf:ro`,
    "-v",
    `${dist}:/usr/share/nginx/html:ro`,
    "-v",
    `${headersFile}:/etc/nginx/nginx-headers.conf:ro`,
    image,
  ]);
  if (run.status !== 0) fail(run.stderr.trim() || "failed to start nginx");

  const portResult = docker(["port", container, "80/tcp"]);
  if (portResult.status !== 0) {
    fail(portResult.stderr.trim() || "failed to resolve nginx port");
  }
  const port = portResult.stdout.trim().match(/:(\d+)$/)?.[1];
  if (!port) fail(`unexpected docker port output: ${portResult.stdout.trim()}`);

  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/_astro/${probeStem}.js`, {
        headers: { "accept-encoding": "gzip" },
      });
      if (response.ok) break;
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
  }
  if (!response?.ok) fail(`nginx returned ${response?.status ?? "no response"}`);

  // Probe every generated security header on both success and error paths.
  const required = [
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "cache-control",
    // Cross-origin headers: `credentialless` COEP enables SAB;
    // `same-origin` COOP + CORP are required for cross-origin
    // isolation. Without these, `cross-origin-isolation` is false
    // in the browser and any future consumer of `SharedArrayBuffer`
    // is silently broken (issues.md P0-6 / P0-7).
    "strict-transport-security",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "cross-origin-embedder-policy",
  ];
  for (const name of required) {
    if (!response.headers.get(name)) fail(`missing ${name}`);
  }
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!csp.includes("form-action 'self'")) {
    fail(`CSP is missing form-action 'self': ${csp}`);
  }
  if (csp.includes("https://www.youtube.com ")) {
    fail(`CSP still allows the non-privacy YouTube frame origin: ${csp}`);
  }

  // Hashed `/_astro/*` bundles must ship both `max-age=31536000`
  // and the `immutable` token (a previous regression dropped
  // `immutable` when the asset moved from `expires 1y;` to
  // `add_header Cache-Control`, regressing repeat-load performance
  // for browsers that honor `immutable`).
  const assetCache = response.headers.get("cache-control") ?? "";
  if (!assetCache.includes("max-age=31536000")) {
    fail(`Cache-Control is missing max-age=31536000: ${assetCache}`);
  }
  if (!assetCache.includes("immutable")) {
    fail(`Cache-Control is missing the immutable token: ${assetCache}`);
  }

  const assetEncoding = response.headers.get("content-encoding") ?? "";
  if (!assetEncoding.includes("gzip")) {
    fail(`/_astro/* response is not gzip encoded: ${assetEncoding || "missing"}`);
  }

  // HTML must NOT inherit the long immutable cache — the comment at
  // `nginx.conf:46-47` (HTML stays short-cached) is part of the contract
  // a previous regression broke. Lock it down with a second probe.
  const html = await fetch(`http://127.0.0.1:${port}/index.html`);
  if (!html.ok) fail(`/index.html returned ${html.status}`);
  const htmlCache = html.headers.get("cache-control") ?? "";
  if (htmlCache.includes("max-age=31536000")) {
    fail(`/index.html unexpectedly inherits the 1y cache: ${htmlCache}`);
  }
  if (htmlCache.includes("immutable")) {
    fail(`/index.html unexpectedly inherits the immutable token: ${htmlCache}`);
  }
  for (const name of required.filter(n => n !== "cache-control")) {
    if (!html.headers.get(name)) fail(`/index.html missing ${name}`);
  }

  // 404 from `try_files $uri =404;` must NOT inherit the long
  // immutable cache either. A previous regression put `always` on
  // the cache header, which would have pinned the 404 in browsers
  // and intermediate caches for a year — the asset would stay
  // broken through deploy races (HTML references an asset the
  // running nginx instance doesn't have yet). The security headers
  // keep `always` and MUST still be present on the 404.
  const missing = await fetch(
    `http://127.0.0.1:${port}/_astro/does-not-exist-${process.pid}.js`
  );
  if (missing.status !== 404) {
    fail(`missing-asset probe returned ${missing.status}, expected 404`);
  }
  const missingCache = missing.headers.get("cache-control") ?? "";
  if (missingCache.includes("max-age=31536000")) {
    fail(
      `/_astro/* 404 unexpectedly carries the 1y cache: ${missingCache}`
    );
  }
  if (missingCache.includes("immutable")) {
    fail(
      `/_astro/* 404 unexpectedly carries the immutable token: ${missingCache}`
    );
  }
  for (const name of required.filter(n => n !== "cache-control")) {
    if (!missing.headers.get(name)) {
      fail(`/_astro/* 404 missing ${name}`);
    }
  }

  // R4: the body of a missed path must come from Astro's themed
  // `dist/404.html`, not nginx's bare default error page. The themed
  // page renders `NotFoundBody.astro`, which carries `id="main-content"`
  // (matches the rest of the site). Without `error_page 404 /404.html;`
  // in `nginx.conf`, Docker users would lose every site affordance
  // on a stale URL.
  const missingBody = await missing.text();
  if (!/id="main-content"/.test(missingBody)) {
    fail(
      `/_astro/* 404 body does not include the themed 404 marker (id="main-content"). ` +
        `nginx.conf is missing the \`error_page 404 /404.html;\` directive (R4).`,
    );
  }

  const localeMissing = await fetch(`http://127.0.0.1:${port}/ru/nope/`);
  if (localeMissing.status !== 404) {
    fail(`/ru/nope/ returned ${localeMissing.status}, expected 404`);
  }
  const localeMissingBody = await localeMissing.text();
  if (!/id="main-content"/.test(localeMissingBody)) {
    fail(`/ru/nope/ does not render the themed 404 body`);
  }
  for (const name of required.filter(n => n !== "cache-control")) {
    if (!localeMissing.headers.get(name)) {
      fail(`/ru/nope/ missing ${name}`);
    }
  }

  process.stdout.write(
    "[test-nginx-headers] security headers, gzip, cache policy, and themed 404 responses passed\n"
  );
} finally {
  docker(["rm", "-f", container]);
  rmSync(asset, { force: true });
}
