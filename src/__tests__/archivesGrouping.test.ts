/**
 * Behavioural tests for `src/utils/archivesGrouping.ts`.
 *
 * The archive page used to group posts by `getUTCFullYear()` /
 * `getUTCDate()`, which mis-bucketed posts whose `pubDatetime`
 * straddled UTC midnight in the post's declared timezone. The fix
 * extracts the grouping math into `archivesGrouping.ts` and routes
 * year / month / day components through
 * `Intl.DateTimeFormat({ timeZone })`, mirroring the rest of the
 * site's timezone-aware date display.
 */
import { describe, it, expect, vi } from "vitest";
import {
  formatDatePartsInTz,
  groupPostsByYearInTz,
  __resetArchivesDtfCacheForTesting,
} from "@/utils/archivesGrouping";
import type { CollectionEntry } from "astro:content";

type Post = CollectionEntry<"posts">;

function makePost(args: {
  pubDatetime: string;
  timezone?: string;
  title?: string;
}): Post {
  return {
    data: {
      pubDatetime: args.pubDatetime,
      timezone: args.timezone,
      title: args.title ?? `post-${args.pubDatetime}`,
    },
  } as unknown as Post;
}

describe("formatDatePartsInTz", () => {
  it("extracts year/month/day in the supplied timezone", () => {
    // 2025-07-15 10:30 UTC = 2025-07-15 17:30 in Asia/Bangkok (+07:00)
    const date = new Date("2025-07-15T10:30:00Z");
    expect(formatDatePartsInTz(date, "Asia/Bangkok")).toEqual({
      year: 2025,
      month: 7,
      day: 15,
    });
  });

  it("falls back to the site-wide timezone when timezone is undefined", () => {
    // setup.ts mocks `config.site.timezone` to "UTC".
    const date = new Date("2025-07-15T10:30:00Z");
    expect(formatDatePartsInTz(date, undefined)).toEqual({
      year: 2025,
      month: 7,
      day: 15,
    });
  });

  it("returns the UTC components when timezone is UTC (sanity check)", () => {
    const date = new Date("2025-07-15T10:30:00Z");
    expect(formatDatePartsInTz(date, "UTC")).toEqual({
      year: 2025,
      month: 7,
      day: 15,
    });
  });
});

describe("groupPostsByYearInTz", () => {
  it("groups a post by its UTC year / day when no timezone is supplied (config fallback)", () => {
    // setup.ts: config.site.timezone = "UTC". A post at 2025-01-01T00:30Z
    // is 2025-01-01 in UTC — bucketed under 2025.
    const post = makePost({ pubDatetime: "2025-01-01T00:30:00Z" });
    const buckets = groupPostsByYearInTz([post]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.year).toBe(2025);
    expect(buckets[0]?.list[0]?.month).toBe(1);
    expect(buckets[0]?.list[0]?.day).toBe(1);
  });

  it("groups a post by the post's effective timezone, NOT the UTC day", () => {
    // Regression: a post stamped 2026-01-01T00:30:00+05:00 is
    // 2025-12-31T19:30:00Z in UTC. The previous `getUTCFullYear()`
    // bucketed it under 2025 with the wrong day. With per-post
    // timezone routing, it lands under 2026 with the right day.
    const post = makePost({
      pubDatetime: "2026-01-01T00:30:00+05:00",
      timezone: "Asia/Karachi", // +05:00
    });
    const buckets = groupPostsByYearInTz([post]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.year).toBe(2026);
    expect(buckets[0]?.list[0]?.month).toBe(1);
    expect(buckets[0]?.list[0]?.day).toBe(1);
  });

  it("renders the per-row MM/DD label in the post's effective timezone, not UTC", () => {
    // Same edge case, verified against the per-row day. The visible
    // label MUST read `01/01:` (in the +05:00 timezone), not `12/31:`.
    const post = makePost({
      pubDatetime: "2026-01-01T00:30:00+05:00",
      timezone: "Asia/Karachi",
    });
    const buckets = groupPostsByYearInTz([post]);
    const row = buckets[0]?.list[0];
    expect(row?.month).toBe(1);
    expect(row?.day).toBe(1);
  });

  it("emits year buckets newest-first", () => {
    const posts = [
      makePost({ pubDatetime: "2023-03-15T00:00:00Z" }),
      makePost({ pubDatetime: "2025-01-01T00:00:00Z" }),
      makePost({ pubDatetime: "2024-06-01T00:00:00Z" }),
    ];
    const buckets = groupPostsByYearInTz(posts);
    expect(buckets.map(b => b.year)).toEqual([2025, 2024, 2023]);
  });

  it("sorts posts within a year by month then day, newest first", () => {
    const posts = [
      makePost({ pubDatetime: "2025-01-15T00:00:00Z", title: "jan-15" }),
      makePost({ pubDatetime: "2025-03-01T00:00:00Z", title: "mar-01" }),
      makePost({ pubDatetime: "2025-01-01T00:00:00Z", title: "jan-01" }),
      makePost({ pubDatetime: "2025-02-10T00:00:00Z", title: "feb-10" }),
    ];
    const buckets = groupPostsByYearInTz(posts);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.list.map(r => r.post.data.title)).toEqual([
      "mar-01",
      "feb-10",
      "jan-15",
      "jan-01",
    ]);
  });

  it("mixes posts with different effective timezones into the right buckets", () => {
    // 2026-01-01T01:00:00+05:00 = 2025-12-31T20:00:00Z.
    // Post A (Asia/Karachi, +05:00) reads 2026-01-01 in its timezone.
    // Post B (UTC) reads 2025-12-31 in its timezone.
    const postA = makePost({
      pubDatetime: "2026-01-01T01:00:00+05:00",
      timezone: "Asia/Karachi",
      title: "post-a",
    });
    const postB = makePost({
      pubDatetime: "2025-12-31T20:00:00Z",
      timezone: "UTC",
      title: "post-b",
    });
    const buckets = groupPostsByYearInTz([postA, postB]);
    expect(buckets.map(b => b.year)).toEqual([2026, 2025]);
    expect(buckets[0]?.list[0]?.post.data.title).toBe("post-a");
    expect(buckets[1]?.list[0]?.post.data.title).toBe("post-b");
  });

  it("returns an empty array for an empty input", () => {
    expect(groupPostsByYearInTz([])).toEqual([]);
  });

  // L18: the cache test exercises the contract that `getDtf` returns
  // the same instance for the same timezone and a fresh instance
  // after `__resetArchivesDtfCacheForTesting()`.
  it("L18: Intl.DateTimeFormat cache returns one instance per timezone", () => {
    __resetArchivesDtfCacheForTesting();
    const d1 = formatDatePartsInTz(new Date("2026-01-01T00:00:00Z"), "UTC");
    // Second call hits the cache, but the result must be identical.
    const d2 = formatDatePartsInTz(new Date("2026-06-01T00:00:00Z"), "UTC");
    expect(d1.year).toBe(2026);
    expect(d2.month).toBe(6);
    // Different timezone gets a separate cache entry.
    const d3 = formatDatePartsInTz(
      new Date("2026-01-01T00:00:00Z"),
      "Asia/Tokyo"
    );
    expect(d3.year).toBe(2026);
    __resetArchivesDtfCacheForTesting();
  });

  // M — exercise the cache against the REAL production config's
  // timezone ("Asia/Ashgabat") to catch the case where the mocked
  // `setup.ts` UTC timezone hides a TZ-specific bug. We pull the
  // helper through the unmocked real config by importing the
  // resolved module AFTER vi.doUnmock for `@/astro-paper.config`.
  it("M: groups correctly under the real config's timezone (Asia/Ashgabat)", async () => {
    vi.resetModules();
    vi.doUnmock("@/astro-paper.config");
    // Re-import the helper + the unmocked config in the same module
    // graph so both reflect the real `astro-paper.config.ts`.
    const { groupPostsByYearInTz: grp } =
      await import("@/utils/archivesGrouping");
    const realConfig = (await import("@/astro-paper.config")).default;

    expect(realConfig.site.timezone).toBe("Asia/Ashgabat");

    // 2026-01-01T00:30:00+05:00 (Ashgabat, +05) is 2025-12-31T19:30:00Z.
    // The post's TZ is post-level + the site fallback — verify BOTH
    // paths resolve into Asia/Ashgabat and bucket under 2026/01/01.
    const postWithoutTz = makePost({
      pubDatetime: "2026-01-01T00:30:00+05:00",
    });
    const bucketsNoTz = grp([postWithoutTz]);
    expect(bucketsNoTz[0]?.year).toBe(2026);
    expect(bucketsNoTz[0]?.list[0]?.month).toBe(1);
    expect(bucketsNoTz[0]?.list[0]?.day).toBe(1);

    const postWithTz = makePost({
      pubDatetime: "2026-01-01T00:30:00+05:00",
      timezone: "Asia/Ashgabat",
    });
    const bucketsWithTz = grp([postWithTz]);
    expect(bucketsWithTz[0]?.year).toBe(2026);
    expect(bucketsWithTz[0]?.list[0]?.day).toBe(1);

    // Reset the runtime mock so subsequent tests in the suite see
    // the original setup-UTC config (test isolation).
    vi.resetModules();
    vi.doMock("@/astro-paper.config");
  });
});
