import type { CollectionEntry } from "astro:content";
import config from "@/config";
import { isPublishTimePassed } from "./postFilter";

/**
 * Pure scheduling check shared with `postFilter` — separated out so the
 * boundary semantics (strict `>` past `pubMs - margin`) have one home
 * that both filters exercise. See `postFilter.ts` for the full rationale.
 */
const isGalleryPublishTimePassed = (
  pubDatetime: string | Date,
  timezone: string | undefined
): boolean =>
  isPublishTimePassed(
    pubDatetime,
    timezone,
    config.content.scheduledPostMargin
  );

/**
 * Determines whether a gallery is eligible to be listed/rendered.
 *
 * - Excludes drafts always
 * - In production, excludes scheduled galleries until `pubDatetime` minus the
 *   configured margin (uses the same `content.scheduledPostMargin` knob as
 *   posts and projects)
 * - In dev, always shows non-draft galleries to make authoring easier
 *
 * `pubDatetime` is interpreted in the gallery's declared `timezone`
 * (falling back to `config.site.timezone`) when it's a string without
 * an explicit timezone marker — see `parseDateInTz` for the rationale.
 */
export function galleryFilter({ data }: CollectionEntry<"galleries">) {
  return (
    !data.draft &&
    (import.meta.env.DEV ||
      isGalleryPublishTimePassed(data.pubDatetime, data.timezone))
  );
}
