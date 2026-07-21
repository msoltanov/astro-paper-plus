/**
 * The shape of all UI strings. Every locale file under `src/i18n/lang/`
 * must `satisfy UIStrings` so the type-checker enforces parity the moment
 * a new key is added.
 *
 * Pluralisation
 * -------------
 * Strings that vary with a count use the `PluralForms` shape from
 * `./format` — translators provide the CLDR categories their language
 * actually uses (typically `one` + `other` for English-style languages,
 * `one` + `few` + `many` + `other` for Russian-style). Consumers pick
 * the right form at runtime via `plural()` from `./format`.
 */
export interface UIStrings {
  nav: {
    home: string;
    posts: string;
    projects: string;
    galleries: string;
    /** Grouped-by-year post index at `/archives/`. */
    archives: string;
    about: string;
    search: string;
    /** Tags listing at `/tags/`. R3 restored this from the legacy
     * `.legacy-i18n-cleanup/` scratch dir after the breadcrumb
     * intermediate kept linking at a 404. */
    tags: string;
  };
  post: {
    publishedAt: string;
    updatedAt: string;
    sharePostIntro: string;
    sharePostOn: string;
    sharePostViaEmail: string;
    tagLabel: string;
    backToTop: string;
    goBack: string;
    editPage: string;
    previousPost: string;
    nextPost: string;
    /** Default label of the "copy" button injected next to <pre> code blocks. */
    copy: string;
    /** Transient label after a successful copy. */
    copied: string;
    /**
     * Transient label after a failed copy (clipboard API blocked —
     * non-secure context, permission denied, etc.). The script flips
     * the button text to this for 1.5 s, then back to `copy`, so the
     * user gets visible feedback that nothing was copied instead of
     * the silent no-op a bare `catch { return }` would produce.
     */
    copyFailed: string;
    /** Heading for the right-rail / mobile-collapsible table of contents. */
    onThisPage: string;
  };
  project: {
    techLabel: string;
    liveDemo: string;
    sourceCode: string;
    backToList: string;
    /** Status pill labels. */
    statusShipped: string;
    statusInProgress: string;
    statusArchived: string;
    /** Card CTA: "Read more" (with arrow). */
    readMore: string;
    /** Card CTA: "View project" (with arrow). */
    viewProject: string;
  };
  gallery: {
    /** "Photo N of M" — header inside the lightbox. `{{index}}` 1-based. */
    ofLabel: string;
    /**
     * Image count badge on a gallery card / gallery detail page —
     * e.g. "12 photos", "1 photo". Uses CLDR plural categories so
     * translators can ship the correct forms for their language
     * (Russian needs one/few/many + other). The runtime helper
     * `plural()` picks the right form for the active count.
     */
    photoCount: import("./format").PluralForms;
    /** Card CTA: "View gallery" (with arrow). */
    viewGallery: string;
    /** Per-page "← Back to galleries" link on a gallery detail page. */
    backToList: string;
    /** "Open gallery: <title>" aria-label for the gallery card link. */
    openGallery: string;
    /** Fallback content shown inside a gallery card when no cover
     * image is configured. e.g. en: "No cover". */
    noCover: string;
    /** Lightbox zoom/open button aria-label on the gallery detail page.
     * `{{alt}}` is the image alt text. */
    zoomImage: string;
    /** Lightbox zoom button aria-label fallback when alt is missing. */
    zoomImageNoAlt: string;
  };
  pagination: {
    prev: string;
    next: string;
    page: string;
    /** Accessible label for the `<nav>` landmark wrapping the prev/next
     * buttons + page indicator. Localised so screen-reader users on
     * RU / TR pages hear the correct landmark name. */
    nav: string;
    /** "Page X of Y" indicator between prev/next. `{{current}}` and
     * `{{total}}` are interpolated at render time. */
    pageCount: string;
  };
  home: {
    socialLinks: string;
    featured: string;
    recentPosts: string;
    allPosts: string;
    /** Hero greeting on the home page (e.g. "Mingalaba"). */
    greeting: string;
    /** Short tagline for the RSS icon link. */
    rssFeed: string;
    /** Intro paragraph on the home page (English baseline). */
    heroIntro: string;
    /** "Read the blog posts or check " — the dynamic bit is the link
     * label, which is `home.readme` below. */
    heroCtaLead: string;
    /** Label for the README link in the home page CTA. */
    readme: string;
    /** Suffix that follows the README LinkButton — translators can
     * reorder the sentence around the link by editing this string +
     * `heroCtaLead`. e.g. en: " for more info." */
    heroCtaTail: string;
  };
  footer: {
    copyright: string;
    allRightsReserved: string;
  };
  pages: {
    /** Title for the home page, shown in <title> and OG tags. */
    homeTitle: string;
    /** Description for the home page, shown in meta/OG. */
    homeDesc: string;
    postsTitle: string;
    postsDesc: string;
    projectsTitle: string;
    projectsDesc: string;
    /** Empty state shown on the projects listing page. */
    projectsEmpty: string;
    galleriesTitle: string;
    galleriesDesc: string;
    /** Empty state shown on the galleries listing page. */
    galleriesEmpty: string;
    /** Heading for the `/archives/` page (grouped-by-year post index). */
    archivesTitle: string;
    /** Heading for the `/tags/` page (unique-tag index across posts). */
    tagsTitle: string;
    /** Description for the `/tags/` page (unique-tag index across posts). */
    tagsDesc: string;
    searchTitle: string;
    searchDesc: string;
    /**
     * Localized RSS channel / feed copy. The default feed and each
     * locale-prefixed feed (`/rss.xml`, `/ru/rss.xml`, `/tr/rss.xml`)
     * pull both the title and description from this object instead of
     * `config.site.description`, which is English even on RU/TR feeds.
     * `feedItemFallback` is the per-item description shown when a post
     * doesn't have a frontmatter `description:` and the body has no
     * `<!-- more -->` marker.
     */
    feedTitle: string;
    feedDescription: string;
    feedItemFallback: string;
  };
  a11y: {
    skipToContent: string;
    openMenu: string;
    closeMenu: string;
    toggleTheme: string;
    searchPlaceholder: string;
    noResults: string;
    goToPreviousPage: string;
    goToNextPage: string;
    /** aria-label for the language switcher trigger. */
    languageSwitcher: string;
    notTranslated: string;
    /** Fallback title for mail link in Socials. `{{title}}` is site.title. */
    sendEmail: string;
    /** Fallback title for social profile link. `{{title}}` is site.title,
     * `{{platform}}` is the social network name (capitalised). */
    socialOn: string;
    /** aria-label for the project card "Read more" link. `{{title}}` is the
     * project title. */
    readMoreAbout: string;
    /** Image lightbox: trigger aria-label. `{{alt}}` is the image alt text. */
    zoomImage: string;
    /** Image lightbox: trigger aria-label when the image has no alt text. */
    zoomImageNoAlt: string;
    /** Image lightbox: dialog aria-label. `{{alt}}` is the image alt text. */
    imagePreview: string;
    /** Image lightbox: dialog aria-label when the image has no alt text. */
    imagePreviewNoAlt: string;
    /** Image lightbox: close button aria-label. */
    closeImagePreview: string;
  };
  media: {
    /** Fallback text shown inside a <video> element when the browser cannot play it.
     * `{{src}}` is the original file URL. */
    cannotPlayVideo: string;
    /** Fallback text shown inside an <audio> element when the browser cannot play it.
     * `{{src}}` is the original file URL. */
    cannotPlayAudio: string;
    /** ARIA label / iframe title for an embedded video player.
     * `{{provider}}` is "YouTube", "Vimeo", etc. */
    videoPlayer: string;
    /** Accessible label for a native audio player. `{{title}}` is the optional
     * caption supplied by the author. */
    audioPlayer: string;
    /** Default caption used when the author does not supply one. */
    audioFallbackTitle: string;
  };
  notFound: {
    title: string;
    message: string;
    goHome: string;
  };
  /**
   * Strings inserted by `rehypeExternalLinks` (build-time plugin) into
   * off-site anchors. Currently just the WCAG 3.2.5 "change on
   * request" announcement — kept as a structured section so future
   * a11y / SEO insertions (e.g. a visible icon label) can land here
   * without bloating the `a11y` namespace.
   */
  link: {
    /**
     * The visually-hidden suffix appended after external link text.
     * Screen readers announce the original text first, then this
     * parenthetical; the leading space + parentheses keep the
     * sentence sounding natural.
     */
    opensInNewTab: string;
  };
}
