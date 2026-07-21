import { describe, it, expect } from "vitest";
import { transformerFileName } from "@/utils/transformers/fileName";
import type { Element } from "hast";

/**
 * `transformerFileName` is excluded from the global coverage gate at
 * `vitest.config.ts:60` because Shiki transformers are exercised
 * indirectly through the markdown build. These tests pin the contract
 * directly so a refactor doesn't silently shift the rendered DOM.
 */

type FakePre = Element & {
  properties: { style?: string; className?: string | string[] };
};

const makePre = (): FakePre =>
  ({
    type: "element",
    tagName: "pre",
    properties: {},
    children: [],
  }) as unknown as FakePre;

type CallContext = {
  options: { meta?: { __raw?: string } };
  addClassToHast: (node: FakePre, cls: string) => void;
};

const makeCtx = (raw?: string): CallContext => ({
  options: { meta: raw ? { __raw: raw } : {} },
  addClassToHast: (node, cls) => {
    const cur = node.properties.className;
    const arr = Array.isArray(cur) ? cur : cur ? [cur] : [];
    node.properties.className = arr.concat(cls);
  },
});

/**
 * Wrap the `pre()` invocation in a small helper. The Shiki type for
 * `.pre` is `((this: Ctx, hast: Element) => ... ) | undefined`; our
 * transformer always defines it, so we narrow with a runtime guard
 * here rather than `as any` at every call site.
 */
const callPre = (
  t: ReturnType<typeof transformerFileName>,
  ctx: CallContext,
  node: FakePre
): void => {
  const fn = t.pre;
  if (!fn) {
    throw new Error("transformerFileName().pre is unexpectedly undefined");
  }
  fn.call(ctx as never, node);
};

describe("transformerFileName", () => {
  it("sets the v2 --file-name-offset style by default and does not append a label span when no file meta is present", () => {
    const node = makePre();
    const ctx = makeCtx();
    callPre(transformerFileName({}), ctx, node);
    expect(node.properties.style).toContain("--file-name-offset: -0.75rem");
    expect(node.children).toHaveLength(0);
  });

  it("sets the v1 --file-name-offset style when style: 'v1'", () => {
    const node = makePre();
    const ctx = makeCtx();
    callPre(transformerFileName({ style: "v1" }), ctx, node);
    expect(node.properties.style).toContain("--file-name-offset: 0.75rem");
  });

  it("appends a <span> child carrying the filename when meta.file='hello.ts' is present", () => {
    const node = makePre();
    const ctx = makeCtx('file="hello.ts"');
    callPre(transformerFileName({}), ctx, node);
    expect(node.children).toHaveLength(1);
    const child = node.children[0] as Element;
    expect(child.type).toBe("element");
    expect(child.tagName).toBe("span");
    expect(child.children[0]).toEqual({ type: "text", value: "hello.ts" });
  });

  it("renders the v2 badge styling classes on the label span", () => {
    const node = makePre();
    const ctx = makeCtx('file="hello.ts"');
    callPre(transformerFileName({ style: "v2" }), ctx, node);
    const child = node.children[0] as Element;
    const props = child.properties as {
      class?: string[];
      className?: string[];
    };
    const cls = (props.class ?? props.className ?? []).join(" ");
    expect(cls).toContain("border");
    expect(cls).toContain("rounded-md");
    expect(cls).toContain("bg-background");
    expect(cls).toContain("before:");
  });

  it("renders the v1 label shape (rounded-t-md + border-b-0)", () => {
    const node = makePre();
    const ctx = makeCtx('file="hello.ts"');
    callPre(transformerFileName({ style: "v1" }), ctx, node);
    const child = node.children[0] as Element;
    const props = child.properties as {
      class?: string[];
      className?: string[];
    };
    const cls = (props.class ?? props.className ?? []).join(" ");
    expect(cls).toContain("rounded-t-md");
    expect(cls).toContain("border-b-0");
  });

  it("drops the green-dot pseudo-element when hideDot: true", () => {
    const node = makePre();
    const ctx = makeCtx('file="hello.ts"');
    callPre(transformerFileName({ style: "v2", hideDot: true }), ctx, node);
    const child = node.children[0] as Element;
    const props = child.properties as {
      class?: string[];
      className?: string[];
    };
    const cls = (props.class ?? props.className ?? []).join(" ");
    expect(cls).not.toContain("before:");
  });

  it("adds an mt-8 class to the pre when meta.file is present (room for the label)", () => {
    const node = makePre();
    const ctx = makeCtx('file="hello.ts"');
    callPre(transformerFileName({}), ctx, node);
    const className = node.properties.className;
    const classes = Array.isArray(className)
      ? className
      : className
        ? [className]
        : [];
    expect(classes.join(" ")).toContain("mt-8");
  });

  it("does not add the v1-specific 'rounded-tl-none' class for v2", () => {
    const node = makePre();
    const ctx = makeCtx('file="hello.ts"');
    callPre(transformerFileName({ style: "v2" }), ctx, node);
    const className = node.properties.className;
    const classes = Array.isArray(className)
      ? className
      : className
        ? [className]
        : [];
    expect(classes.join(" ")).not.toContain("rounded-tl-none");
  });
});
