#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contentRoot = join(root, "src", "content");
const blocked = /<\s*(?:script|form)\b|javascript\s*:|<\s*iframe\b[^>]*\bsrcdoc\s*=/i;
const findings = [];

function scanFile(filePath) {
  const source = readFileSync(filePath, "utf8").replace(
    /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,
    ""
  );
  const lines = source.split(/\r?\n/);
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const withoutInlineCode = line.replace(/`+[^`]*`+/g, "");
    if (blocked.test(withoutInlineCode)) {
      findings.push(`${relative(root, filePath)}:${index + 1}`);
    }
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) walk(filePath);
    else if (
      entry.isFile() &&
      (extname(entry.name) === ".md" || extname(entry.name) === ".mdx")
    ) {
      scanFile(filePath);
    }
  }
}

walk(contentRoot);
if (findings.length > 0) {
  throw new Error(
    `[check-md-script] blocked raw active content outside fenced code:\n${findings.join("\n")}`
  );
}
process.stdout.write("[check-md-script] content trust-boundary checks passed.\n");
