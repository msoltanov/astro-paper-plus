import type { CollectionEntry } from "astro:content";
import config from "@/config";
import { isPublishTimePassed } from "./postFilter";

/**
 * Determines whether a project is eligible to be listed/rendered.
 *
 * Mirror of `galleryFilter` for the projects collection. The projects
 * schema (`sharedFrontmatter()` in `content.config.ts`) provides the
 * same `draft + pubDatetime + timezone` shape as galleries, so the
 * filter logic is identical.
 *
 * - Excludes drafts always
 * - In production, excludes scheduled projects until `pubDatetime` minus
 *   the configured margin (uses `content.scheduledPostMargin` — the
 *   same knob as posts and galleries).
 * - In dev, always shows non-draft projects to make authoring easier
 *
 * Without this filter, a `draft: true` project would render publicly
 * AND leak into `sitemap.xml` (the sitemap is harvested from rendered
 * HTML by `src/integrations/sitemap.ts`, so filtering at the route
 * level propagates here too).
 */
export function projectFilter({ data }: CollectionEntry<"projects">) {
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
