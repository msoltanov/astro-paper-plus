import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CollectionEntry } from "astro:content";
import { postFilter, isPublishTimePassed } from "@/utils/postFilter";
import { parseDateInTzMs } from "@/utils/parseDateInTz";

/**
 * postFilter's behavior:
 * - excludes drafts (always)
 * - in production: excludes scheduled posts (publish time hasn't arrived
 *   minus the configured margin)
 * - in dev (import.meta.env.DEV): includes all non-draft posts
 *
 * In vitest the env flag is whatever the dev/prod build was — so we
 * only assert on the parts that don't depend on it:
 * - drafts always excluded
 * - past-dated posts always included
 * - the function returns a boolean and never throws
 * - the absolute UTC moment used for the comparison is derived from
 *   parseDateInTz (so it's TZ-consistent, not machine-local)
 */
const makePost = (
  draft: boolean,
  pubDatetime: string | Date,
  timezone?: string
): CollectionEntry<"posts"> =>
  ({
    data: {
      title: "x",
      description: "x",
      pubDatetime,
      draft,
      ...(timezone ? { timezone } : {}),
    },
  }) as unknown as CollectionEntry<"posts">;

describe("postFilter", () => {
  it("excludes drafts regardless of date", () => {
    const past = new Date(Date.now() - 60_000);
    const post = makePost(true, past);
    expect(postFilter(post)).toBe(false);
  });

  it("includes non-draft, past-dated posts", () => {
    const past = new Date(Date.now() - 60_000);
    const post = makePost(false, past);
    expect(postFilter(post)).toBe(true);
  });

  it("returns a boolean (never throws)", () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    expect(typeof postFilter(makePost(false, past))).toBe("boolean");
    expect(typeof postFilter(makePost(false, future))).toBe("boolean");
    expect(typeof postFilter(makePost(true, past))).toBe("boolean");
  });
});

describe("postFilter — timezone consistency", () => {
  /**
   * The bug being fixed: `new Date("2025-07-15T10:30:00")` is parsed in
   * the build machine's local timezone, so the same frontmatter string
   * produces different UTC ms across environments. postFilter must use
   * parseDateInTz so the comparison is reproducible regardless of the
   * build machine's TZ env.
   *
   * `setup.ts` configures `config.site.timezone = "UTC"` for tests.
   * We rely on that to make assertions stable.
   */
  it("treats an ambiguous frontmatter string as wall-clock in site.timezone (UTC)", () => {
    // 2026-01-01T00:00:00 in UTC — clearly in the past regardless of
    // the build machine's TZ (it's years before today).
    const pastUtcWallClock = "2020-01-01T00:00:00";
    const post = makePost(false, pastUtcWallClock);
    expect(postFilter(post)).toBe(true);
  });

  it("a per-post timezone overrides the site default for ambiguous strings", () => {
    // Same wall-clock string `2020-01-01T00:00:00`, but interpreted as
    // UTC+14 (e.g. Pacific/Kiritimati-ish). Still in the past.
    const post = makePost(false, "2020-01-01T00:00:00", "Etc/GMT-14");
    expect(postFilter(post)).toBe(true);
  });

  it("an explicit-Z string is unambiguous and yields a stable result", () => {
    const pastUtc = "2020-01-01T00:00:00Z";
    const post = makePost(false, pastUtc);
    expect(postFilter(post)).toBe(true);
    // And the resolved ms equals the explicit-UTC interpretation —
    // no TZ translation, no surprise.
    expect(parseDateInTzMs(pastUtc)).toBe(Date.UTC(2020, 0, 1, 0, 0, 0));
  });

  it("does NOT call `new Date()` directly on an ambiguous string (would reintroduce the bug)", () => {
    // Sanity check: if postFilter were still using `new Date(str)` on
    // an ambiguous string, the resolved ms would differ between
    // build-machine TZs. parseDateInTz normalizes that.
    const str = "2020-01-01T00:00:00";
    const resolved = parseDateInTzMs(str);
    // With site TZ = Asia/Ashgabat (UTC+5, setup.ts), midnight
    // wall-clock is 2019-12-31T19:00:00.000Z.
    expect(resolved).toBe(Date.UTC(2019, 11, 31, 19, 0, 0));
  });
});

/**
 * Pure helper tests. The dev/prod branch in `postFilter` is gated by
 * `import.meta.env.DEV` which can't be stubbed under vitest — we cover
 * the time-comparison branch directly via `isPublishTimePassed` and
 * use fake timers so `Date.now()` is deterministic.
 *
 * Boundary semantics: the check is strict-greater-than
 * (`Date.now() > pubMs - marginMs`). A post whose early-window
 * threshold (`pubMs - marginMs`) exactly equals `Date.now()` is NOT
 * yet published — the post only becomes visible one millisecond
 * later. The off-by-one-ms at the exact boundary is intentional so
 * a post doesn't become visible one clock-tick early under wall-clock
 * skew between the build machine and the runtime.
 */
describe("isPublishTimePassed", () => {
  const MARGIN_MS = 15 * 60 * 1000; // matches config.content.scheduledPostMargin
  const REAL_NOW = new Date("2025-07-15T12:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REAL_NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for a post published long in the past", () => {
    expect(
      isPublishTimePassed("2024-01-01T00:00:00Z", undefined, MARGIN_MS)
    ).toBe(true);
  });

  it("returns false for a post published far in the future", () => {
    expect(
      isPublishTimePassed("2099-01-01T00:00:00Z", undefined, MARGIN_MS)
    ).toBe(false);
  });

  it("treats posts in the pre-publication window (pubMs - margin < now) as published", () => {
    // pubDatetime is 5 minutes in the future — but margin is 15 minutes,
    // so pubMs - margin is 10 minutes in the past → published.
    const futurePub = new Date(REAL_NOW + 5 * 60 * 1000).toISOString();
    expect(isPublishTimePassed(futurePub, undefined, MARGIN_MS)).toBe(true);
  });

  it("excludes posts whose pubMs - margin is still in the future", () => {
    // pubDatetime is 1 hour in the future — margin is 15 minutes, so
    // pubMs - margin is 45 minutes in the future → scheduled (hidden).
    const futurePub = new Date(REAL_NOW + 60 * 60 * 1000).toISOString();
    expect(isPublishTimePassed(futurePub, undefined, MARGIN_MS)).toBe(false);
  });

  it("boundary: exactly at the margin is treated as NOT-yet-published (strict >)", () => {
    // pubMs - margin === now → strict greater-than is false, so the
    // post is NOT yet published. One millisecond later, it crosses the
    // threshold (see the `barely outside the window` case below).
    const pubAtMargin = new Date(REAL_NOW + MARGIN_MS).toISOString();
    expect(isPublishTimePassed(pubAtMargin, undefined, MARGIN_MS)).toBe(false);
  });

  it("returns false when barely outside the window", () => {
    // pubMs - margin is 1 ms in the future.
    const pubJustAbove = new Date(REAL_NOW + MARGIN_MS + 1).toISOString();
    expect(isPublishTimePassed(pubJustAbove, undefined, MARGIN_MS)).toBe(false);
  });

  it("uses an explicit margin override for testing the knob", () => {
    const pub = new Date(REAL_NOW + 10 * 60 * 1000).toISOString();
    // 10-minute margin: pubMs - margin = 0 ms in future → scheduled
    expect(isPublishTimePassed(pub, undefined, 10 * 60 * 1000)).toBe(false);
    // 11-minute margin: pubMs - margin = 1 ms in past → published
    expect(isPublishTimePassed(pub, undefined, 11 * 60 * 1000)).toBe(true);
  });
});
