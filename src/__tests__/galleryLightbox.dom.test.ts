import { beforeEach, describe, expect, it, vi } from "vitest";

type LightboxInstance = {
  init: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const lightboxMock = vi.hoisted(() => ({
  instances: [] as LightboxInstance[],
  options: [] as unknown[],
}));

vi.mock("photoswipe/lightbox", () => ({
  default: class {
    init = vi.fn();
    destroy = vi.fn();

    constructor(options: unknown) {
      lightboxMock.options.push(options);
      lightboxMock.instances.push(this);
    }
  },
}));

beforeEach(() => {
  lightboxMock.instances.length = 0;
  lightboxMock.options.length = 0;
  document.body.innerHTML =
    '<div id="pswp-gallery"><a href="/full.jpg"></a></div>';
  vi.resetModules();
});

describe("galleryLightbox", () => {
  it("destroys the previous instance before reinitializing", async () => {
    const { initGalleryLightbox } = await import("@/scripts/galleryLightbox");

    initGalleryLightbox();
    initGalleryLightbox();

    expect(lightboxMock.instances).toHaveLength(2);
    expect(lightboxMock.instances[0].init).toHaveBeenCalledOnce();
    expect(lightboxMock.instances[0].destroy).toHaveBeenCalledOnce();
    expect(lightboxMock.instances[1].init).toHaveBeenCalledOnce();
    expect(lightboxMock.instances[1].destroy).not.toHaveBeenCalled();
    expect(lightboxMock.options[1]).toMatchObject({
      gallery: "#pswp-gallery",
      // P3-8: tightened the children selector so any future `<a>`
      // placed inside `#pswp-gallery` for non-lightbox purposes
      // (e.g. a "credits" link) is not picked up as a slide. The
      // data-pswp-width attribute is set by every real gallery
      // `<a>` at `galleries/[...slug].astro` and is what gates
      // lightbox pick-up.
      children: "a[data-pswp-width]",
      bgOpacity: 0.9,
      showHideAnimationType: "fade",
    });
  });
});
