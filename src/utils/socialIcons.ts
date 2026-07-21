type SocialIcon = (_props: Record<string, unknown>) => unknown;

type IconModule = { default: SocialIcon };

/**
 * iconsByName — pre-loaded icon module map keyed by filename stem.
 *
 * T2-9: the previous implementation used the ABSOLUTE glob pattern
 * `"/src/assets/icons/socials/*.svg"`, which worked under Vite but
 * is documented as non-portable (Vite's recommended form is
 * relative to the importing module). The blocker for migrating
 * wasn't the glob shape itself — it was that consumers
 * (`src/components/Socials.astro` and `src/components/post/
 * ShareLinks.astro`) BOTH hardcoded the absolute-path key
 * `/src/assets/icons/socials/${name}.svg` to look modules up.
 *
 * This refactor:
 *   1. Switches the glob to the relative form
 *      `"../assets/icons/socials/*.svg"`.
 *   2. Loads modules eagerly so callers see a synchronous Map
 *      (avoids the per-call Promise.all round-trip).
 *   3. Re-keys the map by filename STEM (e.g. `"github"`) instead
 *      of glob path, so callers don't need to know the path.
 *   4. Exposes `getSocialIcons()` (the full map) and
 *      `getSocialIcon(name)` (single lookup). ShareLinks.astro
 *      previously ran its own inline glob; it now uses
 *      `getSocialIcons()` so the icon manifest is computed once.
 *
 * The path-to-name mapping is the single place a future
 * contributor has to touch if the icons folder moves or the glob
 * pattern changes again.
 */
const rawModules = import.meta.glob<IconModule>(
  "../assets/icons/socials/*.svg",
  { eager: true }
);

const iconsByName: ReadonlyMap<string, SocialIcon> = new Map(
  Object.entries(rawModules).map(([path, mod]) => {
    const stem = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "");
    return [stem, mod.default];
  })
);

/**
 * Look up a social-icon module by its filename stem (e.g. "github",
 * "whatsapp"). Returns `undefined` when the icon isn't present —
 * callers can either skip rendering or surface a config-vs-assets
 * drift warning.
 */
export function getSocialIcon(name: string): SocialIcon | undefined {
  return iconsByName.get(name);
}

/**
 * Get the full map of icon modules keyed by filename stem.
 * Returned map is reused across calls (no allocation per lookup).
 */
export function getSocialIcons(): ReadonlyMap<string, SocialIcon> {
  return iconsByName;
}
