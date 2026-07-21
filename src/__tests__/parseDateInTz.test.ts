import { describe, it, expect } from "vitest";
import { parseDateInTz, parseDateInTzMs } from "@/utils/parseDateInTz";

describe("parseDateInTz", () => {
  describe("Date input", () => {
    it("returns a Date instance as-is", () => {
      const d = new Date("2025-07-15T10:30:00Z");
      expect(parseDateInTz(d)).toBe(d);
    });

    it("does not consult the timezone argument for a Date input", () => {
      const d = new Date("2025-07-15T10:30:00Z");
      // Even a wildly different TZ must not affect a Date input —
      // it's already absolute.
      expect(parseDateInTz(d, "Asia/Bangkok").getTime()).toBe(d.getTime());
    });
  });

  describe("strings with explicit timezone marker", () => {
    it("parses trailing-Z (UTC) strings as the same UTC ms as `new Date()`", () => {
      const str = "2025-07-15T10:30:00Z";
      expect(parseDateInTz(str).getTime()).toBe(new Date(str).getTime());
    });

    it("parses explicit-offset strings the same as `new Date()`", () => {
      const str = "2025-07-15T10:30:00+07:00";
      expect(parseDateInTz(str).getTime()).toBe(new Date(str).getTime());
    });

    it("parses explicit-offset strings even when a different TZ is supplied", () => {
      const str = "2025-07-15T10:30:00+07:00";
      // Explicit offset wins; the second arg is ignored.
      expect(parseDateInTz(str, "America/New_York").getTime()).toBe(
        new Date(str).getTime()
      );
    });
  });

  describe("strings WITHOUT explicit timezone marker", () => {
    it("interprets as wall-clock in the resolved timezone (per-post TZ)", () => {
      // Same string interpreted in Bangkok should be 7h EARLIER in UTC
      // than the same wall-clock in UTC.
      const str = "2025-07-15T10:30:00";
      const bangkokMs = parseDateInTz(str, "Asia/Bangkok").getTime();
      const utcMs = parseDateInTz(str, "UTC").getTime();
      expect(utcMs - bangkokMs).toBe(7 * 60 * 60 * 1000);
    });

    it("falls back to config.site.timezone when no per-post TZ is given", () => {
      // setup.ts mocks `timezone: "Asia/Ashgabat"` for the site default.
      const str = "2025-07-15T10:30:00";
      // Asia/Ashgabat is UTC+5 — wall-clock 10:30 translates to 05:30 UTC.
      expect(parseDateInTz(str).getTime()).toBe(
        Date.UTC(2025, 6, 15, 5, 30, 0)
      );
    });

    it("matches `new Date()` ONLY when the build TZ equals the resolved TZ", () => {
      // The whole point: an ambiguous string like "2025-07-15T10:30:00"
      // must not depend on the build machine's local TZ. With the
      // resolved TZ set to UTC, the result is the same as
      // `Date.UTC(2025, 6, 15, 10, 30, 0)` regardless of the build env.
      const str = "2025-07-15T10:30:00";
      const resolved = parseDateInTz(str, "UTC");
      expect(resolved.toISOString()).toBe("2025-07-15T10:30:00.000Z");
    });
  });

  describe("date-only strings", () => {
    it("treats `YYYY-MM-DD` as midnight in the resolved TZ", () => {
      // 2025-07-15 00:00 in Asia/Bangkok = 2025-07-14 17:00 UTC.
      const d = parseDateInTz("2025-07-15", "Asia/Bangkok");
      expect(d.toISOString()).toBe("2025-07-14T17:00:00.000Z");
    });
  });

  describe("invalid timezone / unparseable value fallback", () => {
    it("falls back to `new Date(value)` for an invalid timezone name (does not throw)", () => {
      // `Asia/Ashhabad` (typo) is not in the IANA tz database;
      // dayjs.tz() throws a RangeError. The helper must swallow
      // it so a single bad post can't kill the build.
      const str = "2025-07-15T10:30:00";
      const d = parseDateInTz(str, "Asia/Ashhabad");
      // Fallback uses the host TZ; we don't pin the absolute
      // instant — only that the call returned a valid Date that
      // represents the same wall-clock string the author wrote.
      expect(d).toBeInstanceOf(Date);
      expect(Number.isNaN(d.getTime())).toBe(false);
    });

    it("throws on genuinely unparseable values instead of returning Invalid Date", () => {
      // Bad content used to silently produce an Invalid Date — which
      // surface downstream as NaN (in parseDateInTzMs, silently
      // omitting the entry from scheduled filters) or as a later
      // RangeError from .toISOString() deep in formatDate. Failing
      // loud here keeps the build error pinned to the actual bad
      // post.
      expect(() => parseDateInTz("not-a-date", "UTC")).toThrow(RangeError);
      // And the error message should call out the offending value so
      // authors can find the bad frontmatter without spelunking.
      expect(() => parseDateInTz("not-a-date", "UTC")).toThrow(/not-a-date/);
    });

    it("throws on malformed strings that still carry an explicit-TZ marker", () => {
      // EXPLICIT_TZ_RE matches the trailing marker only — so nonsense
      // like `not-a-dateZ` or out-of-range components like
      // `2025-01-01T99:00:00Z` slip through that branch and used to
      // return Invalid Date. Same loud-fail contract as the other
      // branches.
      expect(() => parseDateInTz("not-a-dateZ")).toThrow(RangeError);
      expect(() => parseDateInTz("not-a-dateZ")).toThrow(/not-a-dateZ/);
      expect(() => parseDateInTz("2025-01-01T99:00:00Z")).toThrow(RangeError);
      expect(() => parseDateInTz("2025-01-01T99:00:00Z")).toThrow(
        /2025-01-01T99:00:00Z/
      );
    });
  });
});

describe("parseDateInTzMs", () => {
  it("returns the same ms as parseDateInTz(...).getTime()", () => {
    const cases = [
      new Date("2025-07-15T10:30:00Z"),
      "2025-07-15T10:30:00Z",
      "2025-07-15T10:30:00+07:00",
      "2025-07-15T10:30:00",
    ] as const;
    for (const v of cases) {
      expect(parseDateInTzMs(v, "Asia/Bangkok")).toBe(
        parseDateInTz(v, "Asia/Bangkok").getTime()
      );
    }
  });
});
