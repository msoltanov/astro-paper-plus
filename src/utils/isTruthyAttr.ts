/**
 * P2-22: HTML5-truthy check for opt-out data attributes.
 *
 * Background
 * ----------
 * Per HTML5 §2.4.2 the empty string and any value other than the
 * literal string `"false"` (or one of its ASCII-case-insensitive
 * variants) are "truthy" for a boolean attribute. Many authors write
 * `data-no-foo="1"`, `data-no-foo="yes"`, or a bare attribute
 * (`<h2 data-no-foo>`). The previous per-plugin checks (`=== ""` /
 * `=== "true"`) silently ignored every form except the two literal
 * strings the plugin authors had hard-coded.
 *
 * Function
 * --------
 * `isTruthyAttr(v)` returns true when:
 *   - `v` is `undefined` and the attribute is absent — opt-out NOT
 *     active (treat as absence).
 *   - `v === ""` — HTML5 boolean attribute, present.
 *   - `v === true` — HAST sometimes drops values to plain booleans
 *     (e.g. `<input disabled>` → `disabled: true`).
 *   - `v` is a string AND its lowered form != `"false"` AND it isn't
 *     empty.
 *
 * Returns false when `v` is the literal string `"false"` (any case)
 * or when the attribute is genuinely absent (`undefined`). The string
 * `"0"` is treated as truthy per the WHATWG spec — HTML boolean
 * attributes only have the `"false"` / absent distinction.
 *
 * Used by the various `rehype*Plugins` to recognise opt-out values
 * uniformly across the plugin surface.
 */
export function isTruthyAttr(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (v === true) return true;
  if (typeof v !== "string") return Boolean(v);
  if (v === "") return true;
  return v.toLowerCase() !== "false";
}
