#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const headers = readFileSync(join(root, "_headers"), "utf8");
const configSource = readFileSync(join(root, "astro-paper.config.ts"), "utf8");
const siteUrl = configSource.match(/\burl:\s*["'](https?:\/\/[^"']+)["']/)?.[1];
const siteOrigin = siteUrl ? new URL(siteUrl).origin : null;

function directiveSources(name) {
  const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1] ?? "";
  const directive = csp
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(`${name} `));
  return new Set(directive?.split(/\s+/).slice(1) ?? []);
}

const frameSources = directiveSources("frame-src");
const imageSources = directiveSources("img-src");
const findings = [];

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      "i"
    )
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function isAllowed(value, sources) {
  if (/^(?:\/|\.|#)/.test(value)) return true;
  if (value.startsWith("data:")) return sources.has("data:");
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (siteOrigin && url.origin === siteOrigin && sources.has("'self'")) return true;
  return sources.has(url.origin);
}

function scanHtml(filePath) {
  const html = readFileSync(filePath, "utf8");
  for (const match of html.matchAll(/<iframe\b[^>]*>/gi)) {
    const tag = match[0];
    if (/\bsrcdoc\s*=/i.test(tag)) {
      findings.push(`${relative(root, filePath)}: iframe srcdoc is blocked`);
      continue;
    }
    const src = attribute(tag, "src");
    if (src && !isAllowed(src, frameSources)) {
      findings.push(`${relative(root, filePath)}: iframe ${src}`);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attribute(match[0], "src");
    if (src && !isAllowed(src, imageSources)) {
      findings.push(`${relative(root, filePath)}: image ${src}`);
    }
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) walk(filePath);
    else if (entry.isFile() && entry.name.endsWith(".html")) scanHtml(filePath);
  }
}

walk(dist);
if (findings.length > 0) {
  throw new Error(
    `[check-iframe-allowlist] built resources violate CSP:\n${findings.join("\n")}`
  );
}
process.stdout.write("[check-iframe-allowlist] built iframe and image sources match CSP.\n");
