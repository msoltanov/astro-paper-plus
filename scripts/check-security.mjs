import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const mermaidPath = fileURLToPath(
  new URL("../src/scripts/mermaid.ts", import.meta.url)
);
const mermaid = readFileSync(mermaidPath, "utf8");

if (!/securityLevel\s*:\s*["']strict["']/.test(mermaid)) {
  throw new Error("Mermaid must use securityLevel: \"strict\".");
}
if (/securityLevel\s*:\s*["']loose["']/.test(mermaid)) {
  throw new Error("Mermaid contains securityLevel: \"loose\" — this bypasses XSS protections.");
}

const headersPath = resolve(root, "_headers");
if (existsSync(headersPath)) {
  const headers = readFileSync(headersPath, "utf8");
  if (!headers.includes("object-src 'none'")) {
    throw new Error("CSP must include object-src 'none'.");
  }
  if (!headers.includes("frame-ancestors 'none'")) {
    throw new Error("CSP must include frame-ancestors 'none'.");
  }
}

process.stdout.write("[check-security] Mermaid strict security level and CSP posture checks passed.\n");
