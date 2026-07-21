/**
 * PhotoSwipe v5 initializer for a single gallery page.
 *
 * Expected DOM contract (rendered by `src/pages/[...locale]/galleries/[...slug].astro`
 * and the default-locale equivalent):
 *
 * <div id="pswp-gallery" class="pswp-gallery">
 *   <a href="<full-image-url>"
 *      data-pswp-width="<w>"
 *      data-pswp-height="<h>"
 *      data-cropped="true"
 *      target="_blank">
 *     <img ... alt="..." />
 *   </a>
 *   ...
 * </div>
 *
 * PhotoSwipe is dynamically imported on demand via the package's
 * typed entry points (`photoswipe` and `photoswipe/lightbox`) so the
 * JS payload (~7 KB gz core + ~5 KB lightbox) is loaded only on
 * gallery detail pages — never on the rest of the site.
 */
import PhotoSwipeLightbox from "photoswipe/lightbox";

let activeLightbox: PhotoSwipeLightbox | null = null;

export function initGalleryLightbox(galleryId = "pswp-gallery") {
  // P2-27: SSR guard. The function reaches `document` / browser-only
  // state immediately; an SSR import would crash. Matches the same
  // guard pattern used in `backToTopButton.ts:23`.
  if (typeof window === "undefined") return;
  const gallery = document.getElementById(galleryId);
  if (!gallery) return;

  // Destroy the previous instance so its click listeners and
  // internal state are cleaned up before we attach a new one.
  if (activeLightbox) {
    activeLightbox.destroy();
    activeLightbox = null;
  }

  const lightbox = new PhotoSwipeLightbox({
    gallery: `#${galleryId}`,
    // P3-8: tighten the children selector so any future `<a>` placed
    // inside `#pswp-gallery` for non-lightbox purposes (e.g. a
    // "credits" link) is not picked up as a slide. The data-pswp-width
    // attribute is set by every real gallery `<a>`.
    children: "a[data-pswp-width]",
    bgOpacity: 0.9,
    showHideAnimationType: "fade",
    // Dynamic import keeps the heavy PhotoSwipe core (~7 KB gz) off pages
    // that don't include a photo gallery. The lightbox layer is only
    // useful once the core has loaded, so we let the lightbox request
    // it lazily on first open.
    pswpModule: () => import("photoswipe"),
  });

  lightbox.init();
  activeLightbox = lightbox;
}

export function destroyGalleryLightbox() {
  if (typeof window === "undefined") return;
  if (activeLightbox) {
    activeLightbox.destroy();
    activeLightbox = null;
  }
}

export default initGalleryLightbox;
