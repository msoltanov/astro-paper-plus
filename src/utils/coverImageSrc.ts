/**
 * Resolve a `coverImage` frontmatter value to its source URL.
 *
 * The `projects` and `galleries` collections expose `coverImage` in
 * frontmatter but with different schemas:
 *
 *   - `galleries.coverImage`: `image().optional()` — always
 *     `ImageMetadata | undefined`, never a string.
 *   - `projects.coverImage`: `z.union([image(), z.string()]).optional()`
 *     — authors can supply a URL string OR a local image import.
 *
 * Both schemas converge to a string URL at render time. This helper
 * accepts the union so both call sites can share it, removing the
 * `coverImage as { src?: string } | string | undefined` cast pattern
 * that previously leaked through every detail page.
 */
export function coverImageSrc(
  cover: ImageMetadata | string | undefined
): string | undefined {
  if (cover === undefined) return undefined;
  return typeof cover === "string" ? cover : cover.src;
}
