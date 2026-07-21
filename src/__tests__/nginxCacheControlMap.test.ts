import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard for the `$astro_cache_control` map in `nginx.conf`.
 *
 * `scripts/test-nginx-headers.mjs` already proves this end-to-end, but
 * only where Docker exists — it silently `process.exit(0)`s otherwise,
 * which is every local `pnpm gate` run on a machine without Docker.
 * The map therefore shipped broken from the initial commit and stayed
 * broken until CI ran the Docker probe for the first time.
 *
 * The defect: nginx's config lexer treats a quote as a string
 * delimiter ONLY when it is the first character of a token. Written as
 * `~"^/_astro/"` the token begins with `~`, so the quotes survive as
 * literal characters and the compiled regex is `"^/_astro/"` — valid
 * PCRE, accepted silently, and unmatchable against `$uri:$status`.
 * Every lookup fell through to `default ""`, so `add_header
 * Cache-Control` emitted nothing and Docker deploys served hashed
 * `/_astro/*` bundles with no caching directives at all.
 *
 * The correct form puts the quote outside the `~`, as nginx's own map
 * documentation does (`"~Opera Mini" 1;`). These assertions are cheap
 * and run everywhere, so the regression can't come back silently.
 */

const nginxConf = readFileSync(resolve("nginx.conf"), "utf8");

/** The map body, comments stripped — comments in this file legitimately
 *  quote the broken form while explaining it, so they must not be
 *  scanned as if they were directives. */
function mapRules(): string[] {
  const block = nginxConf.match(
    /map\s+"\$uri:\$status"\s+\$astro_cache_control\s*\{([\s\S]*?)\n\}/
  );
  expect(block, "could not locate the $astro_cache_control map").not.toBeNull();
  return block![1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"));
}

describe("nginx $astro_cache_control map", () => {
  it('quotes regex keys as "~... , never ~"...', () => {
    const rules = mapRules();
    expect(rules.length).toBeGreaterThan(1);

    for (const rule of rules) {
      if (rule.startsWith("default")) continue;
      expect(
        rule.startsWith('~"'),
        `\`${rule}\` uses the ~"regex" form; nginx keeps those quotes as ` +
          `literal characters, so the rule can never match. Use "~regex".`
      ).toBe(false);
      expect(
        rule.startsWith('"~'),
        `\`${rule}\` is not a quoted regex key ("~...").`
      ).toBe(true);
    }
  });

  it("keeps the /_astro/ rule in lock-step with the Docker probe", () => {
    // `scripts/test-nginx-headers.mjs` asserts both tokens on a real
    // response; pin them here so a value drift is caught without Docker.
    const astro = mapRules().find(rule => rule.includes("/_astro/"));
    expect(astro).toBeDefined();
    expect(astro).toContain("max-age=31536000");
    expect(astro).toContain("immutable");
  });

  it("still routes every 404 to an empty value before the /_astro/ rule", () => {
    // Deploy-race safety net: an `/_astro/<hash>.js` the running
    // instance doesn't have yet 404s, and must NOT be pinned for a
    // year. nginx evaluates map regexes in declaration order, so the
    // 404 rule only wins while it stays first.
    const rules = mapRules().filter(rule => !rule.startsWith("default"));
    const notFound = rules.findIndex(rule => rule.includes("404"));
    const astro = rules.findIndex(rule => rule.includes("/_astro/"));
    expect(notFound).toBeGreaterThanOrEqual(0);
    expect(astro).toBeGreaterThanOrEqual(0);
    expect(notFound).toBeLessThan(astro);
  });

  it("emits Cache-Control from the map at server level with `always`", () => {
    // Must stay at server level: an `add_header` inside a location
    // block would discard the inherited
    // `include /etc/nginx/nginx-headers.conf;` and strip CSP and the
    // rest of the security headers from those responses.
    expect(nginxConf).toMatch(
      /add_header\s+Cache-Control\s+\$astro_cache_control\s+always\s*;/
    );
  });
});
