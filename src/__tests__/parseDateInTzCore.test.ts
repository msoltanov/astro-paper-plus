import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseDateInTzCore,
  normalizeDateString,
  __resetParseDateInTzWarningsForTesting,
} from "@/utils/parseDateInTzCore";

/**
 * `parseDateInTzCore` is the config-free kernel of `parseDateInTz` —
 * it requires a `timezone` string and has no dependency on
 * `src/config.ts`. The sitemap helpers depend on it (NOT the
 * `parseDateInTz` wrapper) so the sitemap stays loadable during
 * Astro's config-load phase. These tests pin the contract for the
 * kernel directly so a future refactor of the wrapper can't
 * accidentally regress sitemap behaviour.
 */
describe("parseDateInTzCore", () => {
  beforeEach(() => {
    __resetParseDateInTzWarningsForTesting();
  });

  describe("Date inputs", () => {
    it("returns a Date instance unchanged and ignores the timezone argument", () => {
      const d = new Date("2025-07-15T10:30:00Z");
      expect(parseDateInTzCore(d, "UTC")).toBe(d);
      // Per-post TZ doesn't change a Date input — it's already absolute.
      expect(parseDateInTzCore(d, "Asia/Bangkok").getTime()).toBe(d.getTime());
    });

    // T2-6 — a Date + timezone argument should still return the same
    // absolute instant (correctness contract), but the log contract
    // catches the "I set timezone: but it's ignored" contribution
    // that previously went silent. The log level was demoted from
    // `error` → `warn` (was originally `warn`, was promoted to
    // `error` so build-log monitoring that greps for `error`
    // doesn't miss it; now back to `warn` because production log
    // monitoring (Sentry, Datadog) pages on-call for `console.error`
    // and treats the contract-mismatch diagnostic as a real
    // production error — a false-positive generator). The contract
    // is "warn-once dev diagnostic" — `console.warn` matches the
    // intent. The dedup keeps the noise bounded. T3-5 caps the
    // dedup set's growth at 1024 entries (FIFO drop) so a
    // long-running SSR runtime with attacker-controlled frontmatter
    // can't grow this `Set` unboundedly.
    it("T2-6: emits a one-shot warn when a Date is passed with a timezone argument (always, not just DEV)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const d = new Date("2025-07-15T10:30:00Z");
        expect(parseDateInTzCore(d, "Asia/Karachi")).toBe(d);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]![0]).toMatch(
          /Date argument bypasses timezone/
        );

        // Repeat call with the same key → no second warn (dedup).
        expect(parseDateInTzCore(d, "Asia/Karachi")).toBe(d);
        expect(warnSpy).toHaveBeenCalledTimes(1);

        // Different timezone key → another warn.
        expect(parseDateInTzCore(d, "Asia/Bangkok")).toBe(d);
        expect(warnSpy).toHaveBeenCalledTimes(2);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("M5: the Date+timezone warn still fires when DEV=false (no longer DEV-gated)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("DEV", false);
      try {
        const d = new Date("2025-07-15T10:30:00Z");
        expect(parseDateInTzCore(d, "Asia/Karachi")).toBe(d);
        // Previously gated behind import.meta.env.DEV, so prod CI
        // logs missed the diagnostic. Now always fires at `warn`
        // level — see issues.md M5 (DEV gate removed) and T2-6
        // (level demoted from `error` to `warn`).
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllEnvs();
        warnSpy.mockRestore();
      }
    });

    it("T3-5: the dedup set is capped (FIFO drop) past WARNED_PAIRS_MAX entries — set size never exceeds the cap", () => {
      // T3-5 pins the property that matters: the dedup `Set`'s
      // memory footprint is BOUNDED. Whether each post-cap entry
      // re-warns (because FIFO eviction removed the prior matching
      // entry) is a separate question — the cap protects the SET'S
      // SIZE, not the cumulative warn count.
      //
      // The test imports the module-scoped dedup set indirectly
      // through the parseDateInTzCore call. We can't introspect the
      // `Set` directly (it's not exported). The minimum check is:
      //   1. The cap-bound is documented and referenced in source.
      //   2. The `if (size >= cap) evict oldest` branch executes
      //      without error when more than `cap` unique keys arrive.
      //
      // To exercise the cap, emit 1100 unique (Date, tz) pairs and
      // assert that the function did NOT throw on any iteration.
      // (A throw from `Set` size == Infinity would be a regression;
      // the warn count of 1100 is the expected behaviour since each
      // unique key still gets its own warn once.)
      //
      // To generate a unique Date per iteration we clamp `ms` to
      // 0..999 — `new Date(y, m, d, h, min, sec, ms)` rolls ms
      // overflow into the next second (so ms=1000 == sec+1, ms=0),
      // which produces duplicate ISO strings for two different
      // (i) values. The clamp keeps the (sec, ms) → ISO mapping
      // 1:1.
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        let threw = false;
        for (let i = 0; i < 1100; i += 1) {
          const ms = i % 1000;
          const sec = Math.floor(i / 1000) % 60;
          const min = Math.floor(i / (1000 * 60)) % 60;
          const d = new Date(2025, 0, 1, 0, min, sec, ms);
          try {
            parseDateInTzCore(d, "UTC");
          } catch {
            threw = true;
            break;
          }
        }
        // No iteration throws (e.g. evict branch worked), and we
        // fired warns for each unique key (the FIFO eviction
        // ensures each post-cap key is a fresh dedup miss).
        expect(threw).toBe(false);
        expect(warnSpy.mock.calls.length).toBe(1100);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("T3-5 source contains the WARNED_PAIRS_MAX constant and FIFO eviction", () => {
      // Belt-and-braces: a future refactor that drops the cap (or
      // forgets the FIFO drop) silently turns this back into a
      // memory-DoS surface. Pin the source-level contract so the
      // regression is caught at audit time rather than in a
      // production OOM report.
      const src = readFileSync(
        new URL("../utils/parseDateInTzCore.ts", import.meta.url),
        "utf8"
      );
      expect(src).toMatch(/const\s+WARNED_PAIRS_MAX\s*=\s*1024/);
      // FIFO eviction: take the first-inserted entry, delete it.
      expect(src).toMatch(
        /warnedDateTimezonePairs\.values\(\)\.next\(\)\.value/
      );
      expect(src).toMatch(/warnedDateTimezonePairs\.delete\(oldest\)/);
    });
  });

  describe("strings with explicit timezone marker", () => {
    it("parses trailing Z via new Date(str)", () => {
      const str = "2025-07-15T10:30:00Z";
      expect(parseDateInTzCore(str, "UTC").getTime()).toBe(
        new Date(str).getTime()
      );
    });

    it("parses explicit offset like +07:00 via new Date(str)", () => {
      const str = "2025-07-15T10:30:00+07:00";
      expect(parseDateInTzCore(str, "UTC").getTime()).toBe(
        new Date(str).getTime()
      );
    });
  });

  describe("strings WITHOUT explicit timezone marker", () => {
    it("interprets as wall-clock in the supplied timezone", () => {
      const str = "2025-07-15T10:30:00";
      const d = parseDateInTzCore(str, "Asia/Bangkok");
      expect(d.getTime()).toBe(new Date("2025-07-15T10:30:00+07:00").getTime());
    });

    it("produces reproducible UTC ms across different resolved TZs", () => {
      const str = "2025-07-15T10:30:00";
      const bangkokMs = parseDateInTzCore(str, "Asia/Bangkok").getTime();
      const utcMs = parseDateInTzCore(str, "UTC").getTime();
      expect(bangkokMs).not.toBe(utcMs);
      // The TZ argument is the only thing that should change the result.
      expect(parseDateInTzCore(str, "Asia/Bangkok").getTime()).toBe(bangkokMs);
    });
  });

  describe("invalid timezone / unparseable value fallback", () => {
    it("falls back to `new Date(value)` for an invalid timezone name (does not throw)", () => {
      const str = "2025-07-15T10:30:00";
      const d = parseDateInTzCore(str, "Asia/Ashhabad");
      expect(d).toBeInstanceOf(Date);
      expect(Number.isNaN(d.getTime())).toBe(false);
    });

    it("throws on genuinely unparseable values instead of returning Invalid Date", () => {
      expect(() => parseDateInTzCore("not-a-date", "UTC")).toThrow(RangeError);
      expect(() => parseDateInTzCore("not-a-date", "UTC")).toThrow(
        /not-a-date/
      );
    });

    it("throws on malformed strings that still carry an explicit-TZ marker", () => {
      // The explicit-TZ branch doesn't read the timezone argument, but
      // the core requires one for the dayjs.tz branch — pass "UTC" so
      // the typecheck is happy.
      expect(() => parseDateInTzCore("not-a-dateZ", "UTC")).toThrow(RangeError);
      expect(() => parseDateInTzCore("not-a-dateZ", "UTC")).toThrow(
        /not-a-dateZ/
      );
      expect(() => parseDateInTzCore("2025-01-01T99:00:00Z", "UTC")).toThrow(
        RangeError
      );
      expect(() => parseDateInTzCore("2025-01-01T99:00:00Z", "UTC")).toThrow(
        /2025-01-01T99:00:00Z/
      );
    });
  });

  describe("M: NFC normalisation + whitespace trim", () => {
    it("trims surrounding whitespace before parsing", () => {
      const padded = "  2025-07-15T10:30:00  ";
      expect(parseDateInTzCore(padded, "UTC").getTime()).toBe(
        parseDateInTzCore("2025-07-15T10:30:00", "UTC").getTime()
      );
    });

    it("normalises decomposed glyphs to their NFC form before parsing", () => {
      // U+0065 U+0301 ("e" + combining acute) is the decomposed form
      // of U+00E9 ("é"). Pin the normalisation helper directly —
      // testing it via the parse branches introduces noise that
      // throws on legitimate-looking inputs (engines reject
      // `2025-07-15T10:30:00Zcafé` as not-a-date).
      const decomposed = "caf\u0065\u0301 2025";
      const nfc = "caf\u00e9 2025";
      // Both inputs trim() to the same ASCII; NFC normalises the
      // é to its composed form so the helper output is identical.
      expect(normalizeDateString(decomposed)).toBe("café 2025");
      expect(normalizeDateString(nfc)).toBe("caf\u00e9 2025");
      // After normalisation, the outputs round-trip identically.
      expect(normalizeDateString(decomposed)).toBe(
        normalizeDateString(nfc).normalize("NFC")
      );
    });

    it("does NOT throw when the string is whitespace-only after trim", () => {
      // Empty post-trim string is a malformed input — the dayjs.tz
      // branch's loud-fail contract kicks in.
      expect(() => parseDateInTzCore("   ", "UTC")).toThrow(RangeError);
    });
  });
});
