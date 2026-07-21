import { toTransitionName } from "./toTransitionName";
import type { CollectionEntry } from "astro:content";

/**
 * Compose a stable `view-transition-name` for a post title element.
 *
 * The CSS custom-ident must be unique within a document — two cards
 * with the same title (e.g. one across translations, or two in the
 * same listing) would otherwise collide and the browser silently drops
 * the `transition:name`. The composite `${titleId}-${postId}` keeps
 * the identifier stable across:
 *
 *   - the listing card (`Card.astro` <Heading>),
 *   - the default-locale post detail (`posts/[...slug]/index.astro` <h1>),
 *   - the locale-scoped post detail (`[locale]/posts/[...slug].astro` <h1>).
 *
 * Centralising the shape here means a change to the identifier
 * scheme can never leave Card and the detail pages out of sync.
 *
 * Accepts either the typed post entry or its plain id/title pair so
 * callers don't have to leak the whole entry into their scope.
 */
export function postTitleTransitionName(
  post:
    | Pick<CollectionEntry<"posts">, "id" | "data">
    | { id: string; data: { title: string } }
): string {
  return `${toTransitionName(post.data.title)}-${toTransitionName(post.id)}`;
}
