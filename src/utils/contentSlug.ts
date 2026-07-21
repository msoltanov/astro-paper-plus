import { LOCALES, DEFAULT_LOCALE } from "../i18n/locales";
import type { Locale } from "../i18n/locales";

/**
 * Collection folder names that introduce a locale-prefixed URL subtree.
 * Used by `cleanSegmentsFromFilePath` to drop the leading collection
 * segment regardless of whether the path starts with `src/content/`.
 */
export const COLLECTION_DIRS = ["posts", "projects", "galleries"] as const;
export type CollectionDir = (typeof COLLECTION_DIRS)[number];

const LOCALE_SET: ReadonlySet<string> = new Set<string>(LOCALES);

/**
 * Validate a frontmatter `slug:` override. Returns the trimmed, leading-
 * slash-stripped slug on success, or `null` if it fails the contract.
 *
 * Rules:
 *   - Must be a non-empty string.
 *   - Must not start with `/` (authors should write `"guides/foo"`, not `"/guides/foo"`).
 *   - Must not contain `..` (no path traversal).
 *   - Must use only `[A-Za-z0-9_-/]` so the result is safe to embed in
 *     a route param / URL without re-encoding.
 *
 * Returns `null` (not throwing) so the route call sites can fall back
 * to the filename-derived slug silently — same contract used historically.
 */
export function normalizeSlugOverride(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("/")) return null;
  if (trimmed.includes("..")) return null;
  if (!/^[A-Za-z0-9_\-/]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Strip `.md` / `.mdx` from the end of a string, if present.
 */
export function stripExtension(s: string): string {
  return s.replace(/\.(md|mdx)$/i, "");
}

/**
 * Strip a leading locale folder from an id like `en/examples/foo.mdx` →
 * `examples/foo.mdx`. Used as the `id`-only fallback when `filePath`
 * isn't available.
 */
export function stripLeadingLocale(id: string): string {
  const parts = id.replace(/\\/g, "/").split("/");
  if (parts.length > 0 && LOCALE_SET.has(parts[0])) {
    return parts.slice(1).join("/");
  }
  return id;
}

interface DerivedSlug {
  locale: string;
  /** Path segments AFTER the leading collection folder, locale, and extension are stripped. */
  segments: string[];
}

/**
 * Reconstruct the URL slug + locale for a content entry from
 * `id` + `filePath`. Mirrors the historical sitemap `deriveSlug`:
 *
 *   - Drops the collection directory segment (any of `posts`, `projects`,
 *     `galleries`) regardless of where it sits in the path. Handles both
 *     full paths (`src/content/posts/en/foo.mdx`) and bare collection-relative
 *     paths (`posts/en/foo.mdx`).
 *   - Drops `_foo` private folders.
 *   - Detects the leading locale folder (`en`, `ru`, `tr`) and
 *     peels it off; the remainder becomes the path segments.
 *   - Strips the `.md` / `.mdx` extension from the final segment.
 *
 * Id-only fallback: when `filePath` is missing AND no collection dir is
 * present in the id (e.g. legacy callers that pass a bare
 * `tr/site-rewrite.mdx` id), falls back to `stripLeadingLocale(stripExtension(id))`.
 * This mirrors the pre-refactor behavior so caller tests pass without
 * forcing all callers to compute filePath.
 *
 * Returns `null` only when the input is un-routable (e.g. id has no
 * recognizable segments). The route helpers treat null as `/`.
 */
export function deriveSlugFromFilePath(
  filePath: string | undefined,
  id: string
): DerivedSlug | null {
  const source = filePath ?? id;
  const parts = source.replace(/\\/g, "/").split("/").filter(Boolean);
  const collectionIdx = parts.findIndex(p =>
    (COLLECTION_DIRS as readonly string[]).includes(p)
  );
  if (collectionIdx >= 0) {
    let rel = parts.slice(collectionIdx + 1);
    rel = rel.filter(s => !s.startsWith("_"));
    let locale: Locale = DEFAULT_LOCALE;
    if (rel.length > 0 && LOCALE_SET.has(rel[0])) {
      locale = rel[0] as Locale;
      rel = rel.slice(1);
    }
    if (rel.length === 0) return null;
    rel[rel.length - 1] = stripExtension(rel[rel.length - 1]);
    if (rel[rel.length - 1] === "") return null;
    return { locale, segments: rel };
  }

  // No collection dir anywhere — id-only fallback.
  const fallback = stripLeadingLocale(stripExtension(id));
  const segments = fallback.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  // Re-detect locale from the leading id segment when present.
  const locale: Locale =
    parts.length > 0 && LOCALE_SET.has(parts[0])
      ? (parts[0] as Locale)
      : DEFAULT_LOCALE;
  return { locale, segments };
}

/**
 * T2-4: Two slug shapes now co-exist. The Astro-conventional route
 * `params.slug` (T2-4 target) is the bare-segments form WITH leading
 * slash removed — exactly what `[...slug]` matches against the URL path
 * (Astro's docs: `params.slug = "x/y"`, not `"/x/y"`). The historical
 * `*Slug` family and `resolveContentSlug` keep their leading-slash
 * shape for backward compatibility with every existing test and call
 * site; new route code should use `slugSegmentsFromIdOrPath` (no slash)
 * or the new `getContentSlugSegments` alias.
 */

/**
 * Resolve a content entry's URL slug to its pathname, honoring an
 * optional frontmatter `slug:` override.
 *
 *   - When `slugOverride` is a valid slug (per `normalizeSlugOverride`),
 *     returns `/<override>` (forward-slash separators preserved across
 *     nested overrides).
 *   - Otherwise the slug is derived from `id` + `filePath` and returned
 *     as `/<segments>`.
 *   - Returns `"/"` for un-routable inputs.
 *
 * @deprecated Prefer `slugSegmentsFromIdOrPath` or `getContentSlugSegments`
 * for new code; route-param shapes should be leader-slash per Astro
 * convention (see T2-4).
 */
export function resolveContentSlug(
  id: string,
  filePath: string | undefined,
  slugOverride?: unknown
): string {
  const override = normalizeSlugOverride(slugOverride);
  if (override) return "/" + override;
  const derived = deriveSlugFromFilePath(filePath, id);
  return derived ? "/" + derived.segments.join("/") : "/";
}

/**
 * Resolve a content entry's slug to the bare segments (no leading slash).
 * Used by `getContentUrl` so the `<locale>/<collection>/<slug>` shape
 * is built from one source of truth.
 *
 * T2-4: this is also the canonical shape for Astro route `params.slug`
 * (`[...slug]` matches a single string segment set; the leading slash
 * is the URL path separator, not part of the captured slug). Route
 * files that adopted `params: { slug: slugSegmentsFromIdOrPath(...) }`
 * already match this; the per-collection wrappers' `*Slug` aliases
 * retain their historical leading-slash shape only because the rest of
 * the codebase (`Card.astro`, `RSS autodiscovery`, sitemap slugs) reads
 * `*Slug` as a href-shaped URL fragment with the leading slash.
 */
export function slugSegmentsFromIdOrPath(
  id: string,
  filePath: string | undefined,
  slugOverride?: unknown
): string {
  const override = normalizeSlugOverride(slugOverride);
  if (override) return override;
  const derived = deriveSlugFromFilePath(filePath, id);
  return derived ? derived.segments.join("/") : "";
}

/**
 * Build the route-param slug for a content entry (no leading slash,
 * no locale).
 *
 * T2-4: this is the Astro-conventional `params.slug` shape. Routes
 * should migrate from `params: { slug: getPostSlug(...) }` to
 * `params: { slug: getPostSlugSegments(...) }` (or the equivalent for
 * projects / galleries) so the leading slash isn't carried into route
 * param values. Files currently calling the leading-slash `getPostSlug`
 * continue to work — the canonical entry point is now
 * `slugSegmentsFromIdOrPath`.
 *
 * Lives here in `contentSlug.ts` (Astro-free) so it stays unit-testable;
 * the per-collection wrappers in `contentPaths.ts` delegate to this
 * single source of truth.
 */
export function getContentSlugSegments(
  id: string,
  filePath: string | undefined,
  slugOverride?: unknown
): string {
  return slugSegmentsFromIdOrPath(id, filePath, slugOverride);
}

/**
 * @deprecated Use `getContentSlugSegments` for new code. This returns
 * a leading-slash prefix (Astro-conventionally wrong for `params.slug`)
 * for backward compatibility with the historical `getXxxSlug` API
 * surface. `Card.astro` and the RSS autodiscovery path read this as a
 * href-shaped URL fragment, so the leading slash is meaningful for those
 * call sites; future route code should adopt the no-slash variant.
 */
export function getContentSlug(
  id: string,
  filePath: string | undefined,
  slugOverride?: unknown
): string {
  return resolveContentSlug(id, filePath, slugOverride);
}
