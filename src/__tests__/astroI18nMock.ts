export function getRelativeLocaleUrlMock(locale: string, path: string): string {
  const cleanPath = path.replace(/^\//, "").replace(/\/+$/, "");
  const url =
    locale === "en"
      ? cleanPath
        ? `/${cleanPath}`
        : "/"
      : cleanPath
        ? `/${locale}/${cleanPath}`
        : `/${locale}/`;
  return /\/$/.test(url) ? url : `${url}/`;
}
