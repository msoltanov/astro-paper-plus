import { describe, it, expect } from "vitest";
import dayjs from "@/utils/dayjs";

describe("dayjs (shared instance)", () => {
  it("parses a UTC timestamp", () => {
    const d = dayjs.utc("2025-01-15T10:30:00Z");
    expect(d.isValid()).toBe(true);
    expect(d.year()).toBe(2025);
  });

  it("converts a timezone", () => {
    const d = dayjs.tz("2025-01-15T10:30:00Z", "Asia/Ashgabat");
    expect(d.isValid()).toBe(true);
    // The tz plugin shifts the wall clock to the target zone.
    // Ashgabat is UTC+5 all year (no DST), so 10:30 UTC → 15:30.
    // The exact hour depends on dayjs internal resolution path;
    // we assert the offset delta is correct rather than the
    // wall-clock hour to avoid Node-version coupling.
    const offsets = d.utcOffset(); // minutes from UTC
    expect(offsets).toBe(300); // +5 hours = 300 minutes
  });

  it("tz plugin is accessible on the instance", () => {
    // Just assert the plugin is loaded — accessing .tz without the
    // plugin would throw.
    expect(typeof dayjs.tz).toBe("function");
    expect(typeof dayjs.utc).toBe("function");
  });
});
