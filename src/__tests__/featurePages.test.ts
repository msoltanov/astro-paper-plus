import { describe, it, expect } from "vitest";
import config from "@/config";
import { archivesPaths } from "@/utils/featurePages";

describe("archivesPaths", () => {
  it("returns either [] or [{ index: undefined }] based on config", () => {
    const result = archivesPaths();
    // The config's showArchives toggles the gate. The test pin doesn't
    // set showArchives, leaving it to the default config. Assert the
    // shape is correct regardless of current default.
    if (config.features.showArchives) {
      expect(result).toEqual([{ params: { index: undefined } }]);
    } else {
      expect(result).toEqual([]);
    }
  });

  it("returns at most one path entry", () => {
    expect(archivesPaths().length).toBeLessThanOrEqual(1);
  });
});
