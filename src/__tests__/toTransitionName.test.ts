import { describe, it, expect } from "vitest";
import { toTransitionName } from "@/utils/toTransitionName";

describe("toTransitionName", () => {
  it("produces ASCII-only output", () => {
    expect(toTransitionName("café")).toMatch(/^[\x00-\x7F]+$/);
  });

  it("never starts with a digit", () => {
    expect(toTransitionName("123abc")).toMatch(/^[^0-9]/);
  });

  it("is never empty", () => {
    expect(toTransitionName("")).not.toBe("");
    expect(toTransitionName("!!!")).not.toBe("");
  });

  it("encodes CJK codepoints as hex", () => {
    const result = toTransitionName("日本語");
    expect(result).toMatch(/u[0-9a-f]{6}/);
  });

  it("handles slug-like input", () => {
    const result = toTransitionName("my-post-title");
    expect(result).toBe("my-post-title");
  });

  it("replaces dots and special chars", () => {
    const result = toTransitionName("hello.world:test");
    expect(result).not.toContain(".");
    expect(result).not.toContain(":");
  });
});
