export const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|ftp:)/i;

export function normalizeUrlForValidation(value: string): string {
  return value.replace(/[\u0000-\u0020]/g, "");
}

export function isSafeHref(value: string, allowRelative = false): boolean {
  const normalized = normalizeUrlForValidation(value);
  if (normalized === "") return false;
  if (allowRelative && /^[#/.]/.test(normalized)) return true;
  return SAFE_URL_RE.test(normalized);
}
