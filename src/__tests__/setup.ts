import { vi } from "vitest";
import { getRelativeLocaleUrlMock } from "./astroI18nMock";
/**
 * Stub Astro's virtual modules so utility modules can be imported in vitest
 * without booting Astro. The `@/astro-paper.config` import is resolved via
 * the `@/astro-paper.config` alias in vitest.config.ts; no mock needed.
 */
vi.mock("astro:content", () => ({
  defineCollection: () => ({}),
  z: {
    object: () => ({ optional: () => ({}), default: () => ({}) }),
    string: () => ({
      default: () => ({}),
      optional: () => ({}),
      or: () => ({}),
    }),
    date: () => ({ optional: () => ({ nullable: () => ({}) }) }),
    boolean: () => ({ optional: () => ({}) }),
    array: () => ({ default: () => ({}) }),
    number: () => ({ optional: () => ({}) }),
  },
}));

// Filled by tests that need richer Zod behaviour. Default is permissive.
vi.mock("astro/zod", () => ({
  z: {
    object: () => ({ optional: () => ({}), default: () => ({}) }),
    string: () => ({
      default: () => ({}),
      optional: () => ({}),
      or: () => ({}),
    }),
    date: () => ({ optional: () => ({ nullable: () => ({}) }) }),
    boolean: () => ({ optional: () => ({}) }),
    array: () => ({ default: () => ({}) }),
    number: () => ({ optional: () => ({}) }),
  },
}));

vi.mock("astro/loaders", () => ({
  glob: () => ({}),
}));

vi.mock("astro:env/client", () => ({}));

// P1-11: `src/config.ts` now imports `GOOGLE_SITE_VERIFICATION`
// from `astro:env/server` (the variable is consumed at SSR). Mirror
// the client-side mock on the server virtual module so utility tests
// that load `config.ts` (transitively imported by `postFilter`,
// `galleryFilter`, `parseDateInTz`, `getSortedPosts`,
// `resolveDefaultOgImagePath`, `projectFilter`) don't blow up on
// `vi.mock` lookups. The legacy `PUBLIC_` prefix was dropped during
// the M12 rename — the var is SSR-only despite the prefix's normal
// meaning for `context: "client"`.
vi.mock("astro:env/server", () => ({
  GOOGLE_SITE_VERIFICATION: "",
}));

vi.mock("astro:i18n", () => ({
  getRelativeLocaleUrl: getRelativeLocaleUrlMock,
}));

vi.mock("@/astro-paper.config", () => ({
  default: {
    site: {
      url: "https://example.com/",
      title: "Test Site",
      description: "A test site",
      author: "Tester",
      ogImage: "default-og.jpg",
      lang: "en",
      timezone: "Asia/Ashgabat",
      dir: "ltr",
    },
    posts: {
      perPage: 4,
      perIndex: 4,
    },
    content: {
      scheduledPostMargin: 15 * 60 * 1000,
    },
    features: {
      lightAndDarkMode: true,
      dynamicOgImage: true,
      showBackButton: true,
      editPost: { enabled: false },
      search: "pagefind",
    },
    socials: [],
    shareLinks: [],
  },
}));
