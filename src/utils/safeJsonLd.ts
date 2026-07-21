/**
 * `safeJsonLd` — JSON.stringify + escape characters that could break
 * out of a `<script type="application/ld+json">` context when the
 * payload is inlined with `set:html`.
 *
 * Neutralizes:
 *   - `<` -> \u003c — would prematurely close the script tag.
 *   - `>` -> \u003e — closes the script tag in some parsers' recovery mode.
 *   - raw U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) ->
 *     the 6-character escape sequences \u2028 / \u2029.
 *
 *     The escape is meaningful in Node.js, where `JSON.stringify` does
 *     NOT encode raw U+2028 / U+2029 (per ECMA-262 it's allowed to
 *     leave them as raw bytes). In browsers, `JSON.stringify` already
 *     encodes them, so the same regex here becomes a no-op on the
 *     already-escaped 6-character sequences — which is the desired
 *     behaviour in both environments.
 *
 *     Why this matters: the surrounding <script> element becomes a
 *     raw-text JavaScript string literal once parsed, and JS
 *     string-literal parsing treats U+2028 / U+2029 as LINE TERMINATORS
 *     — a raw occurrence breaks out of the string and lets an attacker
 *     append arbitrary JS. Historical XSS vector.
 *
 * The regex literals use \u2028 / \u2029 (six-character escape
 * sequences) rather than raw characters: some JS parsers (including
 * Vite's OXC transform) treat the raw line-separator byte as an
 * actual line terminator, which would split the source and turn the
 * `replace(...)` into an unterminated regular expression. The regex
 * parser still interprets \u2028 as the raw character when the regex
 * is compiled, so this preserves the runtime semantics.
 *
 * `&` does NOT need escaping here — it has no special meaning inside
 * a raw-text <script> element or in JSON.
 */
function _assertWellFormed(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function safeJsonLd(obj: unknown): string {
  const escaped = JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  if (!_assertWellFormed(escaped)) {
    throw new SyntaxError("safeJsonLd produced malformed JSON");
  }
  return escaped;
}
