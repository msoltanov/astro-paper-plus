/**
 * Custom Shiki themes that match the xterm 16-color palette.
 *
 * Why a custom theme:
 *   - Shiki's built-in themes (the existing `min-light` / `night-owl`
 *     pair) are unrelated to the xterm convention; pinning our own
 *     theme lets every token colour resolve to a known hex.
 *   - The hex values here mirror the `--term-*` palette in
 *     `src/styles/theme.css` so syntax colours and Tailwind utilities
 *     (`text-term-red`, `bg-term-green`, …) read identically. **KEEP
 *     BOTH FILES IN SYNC** when adjusting values.
 *
 * Pairing with Shiki:
 *   - `astro.config.ts` imports these and passes them as the
 *     `shikiConfig.themes` value.
 *   - `defaultColor: false` there makes Shiki emit
 *     `--shiki-light` / `--shiki-dark` CSS variables per token, so a
 *     single `data-theme="dark"` flip on `<html>` swaps every code
 *     block at once — no extra JS.
 *
 * Mapping (terminal-faithful):
 *
 *   comments  -> bright black (gray italic)
 *   keywords  -> blue (canonical xterm blue)
 *   strings   -> green (terminal green)
 *   numbers   -> magenta
 *   functions -> yellow in dark, warm orange in light (yellow #cdcd00
 *               is unreadable on white — orange preserves legibility)
 *   tags      -> red
 *   types     -> cyan
 *   attribute -> yellow / orange
 */
import type { ThemeRegistration } from "shiki";

/**
 * Light-mode theme for the xterm 16-color palette.
 *
 * Yellow `#cdcd00` from the canonical xterm palette is unreadable on
 * the `#fdfdfd` blog surface; function/attribute tokens use a warm
 * orange `#aa5500` here instead. The `--term-yellow` CSS variable is
 * the same `#aa5500`, so any Tailwind utility using that token shows
 * the matching colour.
 */
export const xtermLight: ThemeRegistration = {
  name: "xterm-light",
  type: "light",
  colors: {
    "editor.background": "#fdfdfd",
    "editor.foreground": "#282728",
  },
  tokenColors: [
    // Comments — bright-black (gray) italic, terminal convention.
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: "#7f7f7f", fontStyle: "italic" },
    },

    // Keywords, control flow, storage types — xterm blue, bold.
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.control.flow",
        "storage",
        "storage.type",
        "storage.modifier",
      ],
      settings: { foreground: "#0000ee", fontStyle: "bold" },
    },

    // Strings — darker green for legibility on white.
    {
      scope: [
        "string",
        "string.quoted",
        "string.template",
        "markup.inline.raw",
      ],
      settings: { foreground: "#008000" },
    },

    // Regex — warm orange.
    {
      scope: ["string.regexp"],
      settings: { foreground: "#aa5500" },
    },

    // Numbers / language constants — magenta.
    {
      scope: ["constant.numeric", "constant.language"],
      settings: { foreground: "#cd00cd" },
    },

    // Constants (enums, readonly vars) — magenta italic.
    {
      scope: ["variable.other.constant", "variable.other.enummember"],
      settings: { foreground: "#cd00cd", fontStyle: "italic" },
    },

    // Escape sequences in strings.
    {
      scope: ["constant.character.escape"],
      settings: { foreground: "#008b8b" },
    },

    // Function *calls* — warm orange.
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call",
        "variable.function",
      ],
      settings: { foreground: "#aa5500" },
    },

    // Function *declarations* — bold warm orange.
    {
      scope: ["meta.function", "support.function.declaration"],
      settings: { foreground: "#aa5500", fontStyle: "bold" },
    },

    // Types / classes / interfaces — darker cyan for legibility.
    {
      scope: [
        "entity.name.class",
        "entity.name.type",
        "support.type",
        "support.class",
        "entity.name.interface",
      ],
      settings: { foreground: "#008b8b" },
    },

    // HTML / JSX tags — xterm red.
    {
      scope: ["entity.name.tag", "punctuation.definition.tag"],
      settings: { foreground: "#cd0000" },
    },

    // Attributes — warm orange.
    {
      scope: ["entity.other.attribute-name", "meta.attribute-selector"],
      settings: { foreground: "#aa5500" },
    },

    // Object property names — darker cyan.
    {
      scope: ["meta.property-name", "support.constant.property"],
      settings: { foreground: "#008b8b" },
    },

    // Markdown heading anchors — xterm blue, bold.
    {
      scope: ["markup.heading", "entity.name.section"],
      settings: { foreground: "#0000ee", fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.1"],
      settings: { foreground: "#cd0000", fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.2"],
      settings: { foreground: "#aa5500", fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.3"],
      settings: { foreground: "#cd00cd", fontStyle: "bold" },
    },
    {
      scope: ["markup.quote"],
      settings: { foreground: "#cd00cd", fontStyle: "italic" },
    },
    {
      scope: ["markup.list.unnumbered", "markup.list.numbered"],
      settings: { foreground: "#cd0000" },
    },
    {
      scope: ["markup.bold"],
      settings: { fontStyle: "bold" },
    },
    {
      scope: ["markup.italic"],
      settings: { fontStyle: "italic" },
    },

    // Default foreground for anything unmatched.
    {
      scope: [
        "variable",
        "variable.parameter",
        "punctuation",
        "punctuation.separator",
        "punctuation.terminator",
        "keyword.operator",
        "meta.brace",
        "meta.bracket",
      ],
      settings: { foreground: "#282728" },
    },
  ],
};

/**
 * Dark-mode theme for the xterm 16-color palette — faithful to the
 * canonical xterm hex values. The brighter variants (`#ff0000`,
 * `#00ff00`, `#ffff00`, …) are readable on `#212737`, so no light/dark
 * accommodation needed here.
 */
export const xtermDark: ThemeRegistration = {
  name: "xterm-dark",
  type: "dark",
  colors: {
    "editor.background": "#212737",
    "editor.foreground": "#eaedf3",
  },
  tokenColors: [
    // Comments — bright-black (gray) italic.
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: "#7f7f7f", fontStyle: "italic" },
    },

    // Keywords — bright blue, bold.
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.control.flow",
        "storage",
        "storage.type",
        "storage.modifier",
      ],
      settings: { foreground: "#5c5cff", fontStyle: "bold" },
    },

    // Strings — terminal green.
    {
      scope: [
        "string",
        "string.quoted",
        "string.template",
        "markup.inline.raw",
      ],
      settings: { foreground: "#00cd00" },
    },

    // Regex — bright yellow.
    {
      scope: ["string.regexp"],
      settings: { foreground: "#ffff00" },
    },

    // Numbers — bright magenta.
    {
      scope: ["constant.numeric", "constant.language"],
      settings: { foreground: "#ff00ff" },
    },

    // Constants — bright magenta italic.
    {
      scope: ["variable.other.constant", "variable.other.enummember"],
      settings: { foreground: "#ff00ff", fontStyle: "italic" },
    },

    // Escape sequences — cyan.
    {
      scope: ["constant.character.escape"],
      settings: { foreground: "#00cdcd" },
    },

    // Function *calls* — bright yellow.
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call",
        "variable.function",
      ],
      settings: { foreground: "#ffff00" },
    },

    // Function *declarations* — bold bright yellow.
    {
      scope: ["meta.function", "support.function.declaration"],
      settings: { foreground: "#ffff00", fontStyle: "bold" },
    },

    // Types / classes / interfaces — cyan.
    {
      scope: [
        "entity.name.class",
        "entity.name.type",
        "support.type",
        "support.class",
        "entity.name.interface",
      ],
      settings: { foreground: "#00cdcd" },
    },

    // HTML / JSX tags — bright red.
    {
      scope: ["entity.name.tag", "punctuation.definition.tag"],
      settings: { foreground: "#ff0000" },
    },

    // Attributes — bright yellow.
    {
      scope: ["entity.other.attribute-name", "meta.attribute-selector"],
      settings: { foreground: "#ffff00" },
    },

    // Object property names — cyan.
    {
      scope: ["meta.property-name", "support.constant.property"],
      settings: { foreground: "#00cdcd" },
    },

    // Markdown headings.
    {
      scope: ["markup.heading", "entity.name.section"],
      settings: { foreground: "#5c5cff", fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.1"],
      settings: { foreground: "#ff0000", fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.2"],
      settings: { foreground: "#ffff00", fontStyle: "bold" },
    },
    {
      scope: ["markup.heading.3"],
      settings: { foreground: "#ff00ff", fontStyle: "bold" },
    },
    {
      scope: ["markup.quote"],
      settings: { foreground: "#ff00ff", fontStyle: "italic" },
    },
    {
      scope: ["markup.list.unnumbered", "markup.list.numbered"],
      settings: { foreground: "#ff0000" },
    },
    {
      scope: ["markup.bold"],
      settings: { fontStyle: "bold" },
    },
    {
      scope: ["markup.italic"],
      settings: { fontStyle: "italic" },
    },

    // Default foreground.
    {
      scope: [
        "variable",
        "variable.parameter",
        "punctuation",
        "punctuation.separator",
        "punctuation.terminator",
        "keyword.operator",
        "meta.brace",
        "meta.bracket",
      ],
      settings: { foreground: "#eaedf3" },
    },
  ],
};
