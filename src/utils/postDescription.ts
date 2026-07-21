/**
 * `extractExcerpt` / `postDescription` — derive a post description when the
 * author didn't fill in frontmatter `description:`.
 *
 * Author opt-in
 * -------------
 * Inside the markdown body, anywhere you want the excerpt to break, drop:
 *
 *   <!-- more -->
 *
 * Anything before that marker becomes the excerpt. The whole rest of the
 * document is left to the post renderer (the marker is consumed, not
 * displayed). The marker is the same `<!--more-->` convention Jekyll, Hugo,
 * and Eleventy use, so muscle memory carries over.
 *
 * Markdown stripping
 * ------------------
 * The author almost always writes the leading paragraphs as Markdown
 * (links, emphasis, headings, code). We strip them down to plain text so
 * the result is safe to drop into:
 *
 *   - `<meta name="description">` and OG `og:description`
 *   - the RSS `<description>` element
 *   - the listing card (`<p>{description}</p>`)
 *
 * …all of which render Markdown literally (showing `**bold**` etc.) if
 * we hand them raw source. The stripper is deliberately minimal — it's
 * not the place to ship a full HTML→text engine, just the constructs
 * that show up in opening paragraphs of real posts.
 *
 * Rounding rules
 * --------------
 *   - Whitespace inside the marker (`<!--more-->` / `<!-- more -->`, case
 *     insensitive) is normalized so casual authoring works.
 *   - Only the FIRST marker counts; later ones stay in the body.
 *   - A marker buried in a fenced code block is ignored (Markdown's own
 *     rules — code fences swallow HTML comments as text).
 *   - No marker → `undefined`, so callers can transparently fall back.
 */

import type { CollectionEntry } from "astro:content";

/**
 * Fenced code block matcher. We use this to ignore `<!-- more -->` markers
 * that authors happen to write inside example snippets.
 */
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/;

/**
 * Match the `<!-- more -->` marker with arbitrary whitespace inside the
 * comment and leading/trailing whitespace on the line. Case-insensitive on
 * the keyword so `<!-- MORE -->` works too.
 */
const MORE_MARKER_RE = /^\s*<!--\s*more\s*-->\s*$/i;

/**
 * Heading lines (`# …`, `## …`, …). Stripped from the excerpt because
 * excerpt cards repeat the post title, so a heading re-stating it is noise.
 */
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;

/* ------------------------------------------------------------------ *
 * Marker slicing
 * ------------------------------------------------------------------ */

/**
 * Split the body at the FIRST `<!-- more -->` marker that's NOT inside a
 * fenced code block. Returns `[excerpt, rest]`. Returns `[body, ""]` if no
 * marker is found so callers can use the rest-of-body length to detect the
 * no-marker case.
 */
function splitAtMoreMarker(body: string): { excerpt: string; found: boolean } {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker: "`" | "~" | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      const ch = (marker[0] === "`" ? "`" : "~") as "`" | "~";
      if (!inFence) {
        inFence = true;
        fenceMarker = ch;
      } else if (fenceMarker === ch) {
        // Only an identical fence closes (per CommonMark rule 4.5).
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (!inFence && MORE_MARKER_RE.test(line)) {
      return {
        excerpt: lines.slice(0, i).join("\n"),
        found: true,
      };
    }
  }
  return { excerpt: body, found: false };
}

/* ------------------------------------------------------------------ *
 * Markdown → plain text
 * ------------------------------------------------------------------ */

/**
 * Drop the leading "# " (or "## " …) prefix from headings.
 */
function stripHeadingPrefix(line: string): string {
  return line.replace(HEADING_RE, "");
}

/**
 * Inline Markdown strip — handles the constructs authors actually write in
 * opening paragraphs. Not a general Markdown renderer; deliberately scoped.
 *
 *   - HTML comments (including the `<!-- more -->` marker residue, though
 *     the marker is never re-emitted because we split above the marker)
 *   - Fenced code spans (backticks) — collapsed to the content
 *   - `[label](url)` / `[label][ref]` links → label
 *   - `**bold**` / `__bold__` / `*italic*` / `_italic_` / `~~strike~~` /
 *     `==highlight==` markers → content
 *   - Leading list markers (`-`, `*`, `+`, `1.`)
 *   - Leading blockquote `>`
 *   - Markdown image syntax `![alt](url)` → alt text
 */
function stripInline(line: string): string {
  let out = line;

  // HTML comments — the marker itself never reaches here, but authors
  // sometimes leave other `<!-- … -->` notes that aren't meant to render.
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Images: ![alt](url) — keep the alt.
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1");

  // Links: [label](url) and [label][ref] — keep the label, drop the URL.
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");

  // Inline code: `code` — keep the code (text).
  out = out.replace(/`+([^`]+)`+/g, "$1");

  // Bold + italic — left-to-right, longest markers first so `***x***`
  // unwraps cleanly.
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/___([^_]+)___/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  out = out.replace(/~~([^~]+)~~/g, "$1");
  out = out.replace(/==([^=]+)==/g, "$1");

  // Leading list markers (`-`, `*`, `+`, `1.`) and blockquote `>`.
  out = out
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/, "");

  return out;
}

/**
 * Collapse runs of whitespace (including markdown's hard line-break `\` +
 * EOL) into single spaces, then trim. Used as the final cleanup so the
 * excerpt is one reasonable paragraph rather than a stack of `"\n\n\n"`.
 */
function flattenWhitespace(s: string): string {
  return s
    .replace(/\\\r?\n/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Extract the excerpt of a markdown body: everything before the first
 * `<!-- more -->` marker (if any), with markdown formatting stripped down
 * to plain prose. Returns `undefined` when there is no marker — callers
 * can fall back to the site default description rather than fabricating
 * a summary.
 */
export function extractExcerpt(
  body: string | undefined | null
): string | undefined {
  if (!body) return undefined;
  const { excerpt, found } = splitAtMoreMarker(body);
  if (!found) return undefined;
  if (!excerpt.trim()) return undefined;

  const lines = excerpt.split(/\r?\n/);
  const cleaned: string[] = [];
  let inFence = false;
  let fenceMarker: "`" | "~" | null = null;
  for (const raw of lines) {
    const fenceMatch = raw.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      const ch = (marker[0] === "`" ? "`" : "~") as "`" | "~";
      if (!inFence) {
        inFence = true;
        fenceMarker = ch;
        continue;
      }
      if (fenceMarker === ch) {
        inFence = false;
        fenceMarker = null;
        continue;
      }
      // Different-character fence inside a different fence: treat as content.
    }
    if (inFence) continue;

    let line = raw;
    // Skip raw HTML that survives after comment stripping (e.g. <aside>,
    // <figure>, <video>). We don't try to be clever — strip the whole tag.
    if (/^\s*<\/?\w+/.test(line)) continue;
    // Skip Yaml-style "---" fences at the excerpt boundary. Authors sometimes
    // place their own divider before the more-marker for visual rhythm —
    // we don't want to carry that noise into the excerpt card.
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) continue;
    line = stripHeadingPrefix(line);
    line = stripInline(line);
    if (line.trim()) cleaned.push(line);
  }
  const flat = flattenWhitespace(cleaned.join("\n"));
  return flat || undefined;
}

/**
 * Resolve the effective description for a post:
 *
 *   1. Frontmatter `description:` (author override — wins).
 *   2. Excerpt up to a `<!-- more -->` marker in the body.
 *   3. `undefined` — downstream consumers decide the fallback (site
 *      description, omit, etc.). Never an empty string.
 */
export function postDescription(
  post: CollectionEntry<"posts">
): string | undefined {
  const explicit = post.data.description;
  if (explicit && explicit.trim()) return explicit;
  return extractExcerpt(post.body);
}
