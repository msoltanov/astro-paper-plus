/**
 * Remark plugin that turns fenced ` ```mermaid ` code blocks into a
 * `<pre class="mermaid">…</pre>` placeholder that the client-side renderer
 * (see `src/scripts/mermaid.ts`) picks up and renders to SVG.
 *
 * Author syntax in `.md` / `.mdx`:
 *
 *   ```mermaid
 *   flowchart LR
 *     A --> B
 *   ```
 *
 * The plugin runs BEFORE Shiki syntax highlighting so the mermaid source
 * is left untouched (Shiki would otherwise tokenize it through the
 * `mermaid` grammar, which is not what we want).
 *
 * Implementation notes
 * - We replace the `code` AST node with a raw `html` node carrying the
 *   final markup; both `@astrojs/markdown-remark` (for `.md`) and
 *   `@astrojs/mdx` (for `.mdx`) preserve `html` nodes and emit them
 *   verbatim into the page.
 * - We HTML-escape only `<`, `>`, `&` so brackets, square-bracket labels
 *   and arrows in the source survive the round-trip without being
 *   misread as HTML/JSX.
 */
import { visit, SKIP } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Code, Html } from "mdast";

const remarkMermaid: Plugin<[], Root> = () => {
  return tree => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (!parent || typeof index !== "number") return;
      if ((node.lang ?? "").toLowerCase() !== "mermaid") return;

      const source = node.value ?? "";
      const escaped = escapeHtmlPreservingText(source);

      // T1-3: cast the parent once (mutable children array) and drop
      // the per-assignment `as unknown as Code`. The replacement IS an
      // `Html` node, which is a structurally valid mdast node — the
      // generic `children` slot accepts it at runtime; we typed the
      // slot as `unknown[]` so the per-assignment cast disappears.
      const parentChildren = parent.children as unknown[];
      const replacement: Html = {
        type: "html",
        value: `<pre class="mermaid">${escaped}</pre>\n`,
      };
      parentChildren[index] = replacement;

      // Skip past the node we just replaced so the walker doesn't try to
      // re-visit our raw HTML.
      return [SKIP, index + 1];
    });
  };
};

function escapeHtmlPreservingText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default remarkMermaid;
