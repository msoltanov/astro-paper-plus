#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `check-content.mjs` — corruption guard for committed markdown/MDX bodies.
 *
 * Background
 * ----------
 * The repo's content pipeline once shipped posts whose newlines were stripped
 * at block boundaries (`</figure> ## Heading`, ` ``` > [!TIP]`, etc.) — the
 * downstream markdown renderer still produced valid HTML, but every `<h2>` was
 * swallowed and the theme shipped visually-empty articles. `pnpm test` didn't
 * catch it (the post pages render fine), `prettier --check` didn't catch it
 * (prettier preserves prose line layout), and the existing tests didn't assert
 * on rendered heading counts.
 *
 * This script is a heuristic guard. It walks every committed `.md` / `.mdx`
 * under `src/content/` and looks for the specific junction patterns that the
 * 2026-07 corruption produced. False positives are possible but unlikely —
 * the patterns are narrow enough that legitimate posts don't match.
 *
 * Run
 * ---
 *   node scripts/check-content.mjs                 # CI: exits 1 on findings
 *
 * Wired into `scripts/gate.mjs` so a regression lands as a gate failure,
 * not a silent content rot.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const CONTENT_ROOT = join(ROOT, "src", "content");

const PATTERNS = [
  {
    // </figure> ## Heading — closing tag and next heading on the SAME line
    // (a single newline between them is the corruption signature; a blank
    // line between blocks is the legitimate layout).
    re: /<\/figure>[ \t]+##+\s+\S/,
    label: "block element fused with next heading (same line)",
  },
  {
    // </table> > [!TIP] — closing table with next callout on same line
    re: /<\/table>[ \t]+>\s*\[!/,
    label: "closing table fused with next callout (same line)",
  },
  {
    // closing code fence ``` immediately followed by > [!TIP] on same line
    re: /```[^\n]*>[ \t]*\[!/,
    label: "closing code fence fused with callout (same line)",
  },
  {
    // closing code fence immediately followed by a heading on the same line
    re: /```[^\n]*##+\s+\S/,
    label: "closing code fence fused with heading (same line)",
  },
  {
    // </ResponsiveTable> ## Heading — same-line fusion of these two blocks.
    re: /<\/ResponsiveTable>[ \t]+##+\s+\S/,
    label: "ResponsiveTable fused with next heading (same line)",
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...walk(abs));
    } else if (/\.(md|mdx)$/i.test(entry)) {
      out.push(abs);
    }
  }
  return out;
}

function findFenceRanges(source) {
  // Returns an array of [start, end] indices for code-fenced regions,
  // so the guard can skip matches that are inside example markdown inside
  // a fence (the legitimate place where "## " appears mid-file).
  const ranges = [];
  const re = /(^|\n)(```+|~~~+)[^\n]*\n[\s\S]*?(?:\n\2[ \t]*($|\n))/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function inFence(idx, ranges) {
  for (const [a, b] of ranges) {
    if (idx >= a && idx < b) return true;
  }
  return false;
}

function main() {
  const findings = [];
  const files = walk(CONTENT_ROOT);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const ranges = findFenceRanges(source);
    const rel = relative(ROOT, file).split(sep).join("/");

    for (const { re, label } of PATTERNS) {
      const g = re.global ? re : new RegExp(re.source, re.flags + "g");
      let m;
      while ((m = g.exec(source)) !== null) {
        if (inFence(m.index, ranges)) continue;
        const line = source.slice(0, m.index).split("\n").length;
        findings.push({ file: rel, line, label, snippet: source.slice(m.index, m.index + 80).replace(/\n/g, " ") });
      }
    }
  }

  if (findings.length === 0) {
    console.log(`[check-content] ${files.length} files scanned, 0 corruption patterns found.`);
    return;
  }

  console.error(`[check-content] ${findings.length} corruption pattern(s) found:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.label}`);
    console.error(`    > ${f.snippet}`);
  }
  console.error("");
  console.error("These patterns indicate that newlines were stripped at block");
  console.error("boundaries (the 2026-07 corruption class). See issues.md #1.");
  process.exit(1);
}

main();