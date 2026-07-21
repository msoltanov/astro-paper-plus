import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMermaid from "@/utils/remarkMermaid";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

/**
 * Process markdown through remarkParse + remarkMermaid and collect
 * any "html" nodes that the plugin emits.
 */
async function getHtmlNodes(markdown: string): Promise<string[]> {
  const processor = unified().use(remarkParse).use(remarkMermaid);
  const tree = processor.parse(markdown) as Root;
  await processor.run(tree);

  const nodes: string[] = [];
  visit(tree, "html", (node: { value: string }) => {
    nodes.push(node.value);
  });
  return nodes;
}

describe("remarkMermaid", () => {
  it("replaces mermaid code blocks with placeholder pre elements", async () => {
    const nodes = await getHtmlNodes("```mermaid\ngraph TD\nA-->B\n```");
    expect(nodes.length).toBeGreaterThan(0);
    const pre = nodes.find(n => n.includes('class="mermaid"'));
    expect(pre).toBeTruthy();
  });

  it("does not touch non-mermaid code blocks", async () => {
    const nodes = await getHtmlNodes("```js\nconst x = 1;\n```");
    const mermaidPre = nodes.find(n => n.includes('class="mermaid"'));
    expect(mermaidPre).toBeUndefined();
  });

  it("escapes HTML angle brackets in diagram source", async () => {
    const nodes = await getHtmlNodes("```mermaid\ngraph TD\nA-->B\n```");
    const pre = nodes.find(n => n.includes('class="mermaid"'));
    expect(pre).toBeTruthy();
  });
});
