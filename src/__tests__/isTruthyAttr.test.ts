import { describe, it, expect } from "vitest";
import { isTruthyAttr } from "@/utils/isTruthyAttr";

describe("isTruthyAttr", () => {
  it("returns false for undefined (absent attribute)", () => {
    expect(isTruthyAttr(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTruthyAttr(null)).toBe(false);
  });

  it("returns true for an empty string (boolean attribute present)", () => {
    expect(isTruthyAttr("")).toBe(true);
  });

  it("returns true for the boolean true (HAST normalisation)", () => {
    expect(isTruthyAttr(true)).toBe(true);
  });

  it("returns false for literal 'false' (any case)", () => {
    expect(isTruthyAttr("false")).toBe(false);
    expect(isTruthyAttr("False")).toBe(false);
    expect(isTruthyAttr("FALSE")).toBe(false);
  });

  it("returns true for '0' (HTML5 boolean attributes do NOT treat '0' as falsy)", () => {
    expect(isTruthyAttr("0")).toBe(true);
  });

  it("returns true for any other non-empty string", () => {
    expect(isTruthyAttr("1")).toBe(true);
    expect(isTruthyAttr("yes")).toBe(true);
    expect(isTruthyAttr("no")).toBe(true);
    expect(isTruthyAttr("true")).toBe(true);
  });

  it("returns Boolean(v) for non-string, non-boolean, non-nil values", () => {
    expect(isTruthyAttr(1)).toBe(true);
    expect(isTruthyAttr(0)).toBe(false);
    expect(isTruthyAttr([])).toBe(true);
  });
});
