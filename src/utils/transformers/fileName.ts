/**
 * Custom Shiki transformer that adds file-name labels to code blocks.
 *
 * Looks for the `file="filename"` meta attribute in code blocks and emits
 * a styled label showing the filename. Supports two styling variants and
 * can optionally hide the green dot indicator.
 *
 * Lives in TypeScript so `@/tsconfig.json#strict` (`"extends":
 * "astro/tsconfigs/strict"`) type-checks the AST construction alongside
 * the rest of the project.
 *
 * `ShikiTransformer` is exported from `@shikijs/types`, not from
 * `@shikijs/transformers` (which only re-exports the legacy
 * `ShikiTransformer$1` alias).
 */
import type { ShikiTransformer } from "@shikijs/types";
import type { Element } from "hast";

export interface TransformerFileNameOptions {
  /** "v1" = tab-style with rounded top corners; "v2" = badge-style with border. */
  style?: "v1" | "v2";
  /** Drop the green dot indicator before the filename. */
  hideDot?: boolean;
}

export const transformerFileName = ({
  style = "v2",
  hideDot = false,
}: TransformerFileNameOptions = {}): ShikiTransformer => ({
  pre(node: Element) {
    // Add CSS custom property so downstream components (the post page's
    // copy-button offset, for example) can position relative to this label.
    const fileNameOffset = style === "v1" ? "0.75rem" : "-0.75rem";
    node.properties.style =
      (node.properties.style || "") + `--file-name-offset: ${fileNameOffset};`;

    const raw = this.options.meta?.__raw?.split(" ");
    if (!raw) return;

    const metaMap = new Map<string, string>();
    for (const item of raw) {
      const [key, value] = item.split("=");
      if (!key || !value) continue;
      metaMap.set(key, value.replace(/["'`]/g, ""));
    }

    const file = metaMap.get("file");
    if (!file) return;

    // Add additional margin to the code block to make room for the label.
    this.addClassToHast(
      node,
      `mt-8 ${style === "v1" ? "rounded-tl-none" : ""}`
    );

    // Add the file-name label inside the pre.
    node.children.push({
      type: "element",
      tagName: "span",
      properties: {
        class: [
          "absolute py-1 text-foreground text-xs font-medium leading-4",
          hideDot
            ? "px-2"
            : "pl-4 pr-2 before:inline-block before:size-1 before:bg-green-500 before:rounded-full before:absolute before:top-[45%] before:left-2",
          style === "v1"
            ? "left-0 -top-6 rounded-t-md border border-b-0 bg-muted/50"
            : "left-2 top-(--file-name-offset) border rounded-md bg-background",
        ],
      },
      children: [
        {
          type: "text",
          value: file,
        },
      ],
    });
  },
});

export default transformerFileName;
