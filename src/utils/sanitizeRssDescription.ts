import { isSafeHref, normalizeUrlForValidation } from "./safeUrl";

function extractAttribute(
  attributes: string,
  name: string
): { value: string; quote: '"' | "'" | null } | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "i"
  );
  const match = attributes.match(pattern);
  if (!match) return null;
  if (match[1] !== undefined) return { value: match[1], quote: '"' };
  if (match[2] !== undefined) return { value: match[2], quote: "'" };
  return { value: match[3] ?? "", quote: null };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function sanitizeAnchors(html: string): string {
  return html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (_match, attributes: string, label: string) => {
      const href = extractAttribute(attributes, "href");
      const title = extractAttribute(attributes, "title");
      const titleAttribute = title
        ? ` title="${escapeAttribute(title.value)}"`
        : "";
      if (!href) return `<a${titleAttribute}>${label}</a>`;
      const normalizedHref = normalizeUrlForValidation(href.value);
      if (!isSafeHref(normalizedHref, true)) {
        return `<a${titleAttribute}>${label}</a>`;
      }
      return `<a href="${escapeAttribute(normalizedHref)}"${titleAttribute}>${label}</a>`;
    }
  );
}

export function sanitizeRssDescription(value: string): string {
  return sanitizeAnchors(value);
}
