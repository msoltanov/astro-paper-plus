import type { CollectionEntry } from "astro:content";
import config from "../config";
import { parseDateInTzMs } from "./parseDateInTz";

/**
 * Pure scheduling check, exported for tests.
 *
 * Returns true when `now` is strictly past the publish time minus the
 * configured margin (`now > pubMs - marginMs`). The check is
 * strict-greater-than, so a post whose early-window threshold
 * (`pubMs - marginMs`) equals `now` exactly is NOT yet published —
 * the next millisecond it crosses the threshold and the post
 * becomes visible. `scheduledPostMargin` is documented in
 * `astro-paper.config.ts` as "show N minutes early"; the off-by-one-ms
 * at the exact boundary is intentional so a post doesn't become
 * visible one clock-tick early (defensive against wall-clock skew).
 *
 * `pubDatetime` is interpreted in `timezone` (falling back to
 * `config.site.timezone`) when it's a string without an explicit
 * timezone marker — see `parseDateInTz` for the rationale (without
 * this, `new Date("2025-07-15T10:30:00")` would parse in the build
 * machine's local TZ and produce different UTC ms across envs).
 */
export function isPublishTimePassed(
  pubDatetime: string | Date,
  timezone: string | undefined,
  marginMs: number
): boolean {
  const pubMs = parseDateInTzMs(pubDatetime, timezone);
  return Date.now() > pubMs - marginMs;
}

/**
 * Determines whether a post is eligible to be listed/rendered.
 *
 * - Excludes drafts always
 * - In production, excludes scheduled posts until `pubDatetime` minus the configured margin
 * - In dev, always shows non-draft posts to make authoring easier
 */
export function postFilter({ data }: CollectionEntry<"posts">) {
  return (
    !data.draft &&
    (import.meta.env.DEV ||
      isPublishTimePassed(
        data.pubDatetime,
        data.timezone,
        config.content.scheduledPostMargin
      ))
  );
}
