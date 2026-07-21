import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("src");
const components = resolve(root, "components");
const read = (path: string) => readFileSync(path, "utf8");

function astroFiles(path: string): string[] {
  return readdirSync(path).flatMap(entry => {
    const absolute = join(path, entry);
    if (statSync(absolute).isDirectory()) return astroFiles(absolute);
    return absolute.endsWith(".astro") ? [absolute] : [];
  });
}

describe("Astro accessibility contracts", () => {
  it("marks every primary active navigation link as the current page", () => {
    const header = read(resolve(components, "Header.astro"));

    for (const section of ["posts", "projects", "galleries", "about"]) {
      expect(header).toContain(
        `aria-current={isActive("/${section}") ? "page" : undefined}`
      );
    }
  });

  it("localizes unavailable locale labels", () => {
    const switcher = read(resolve(components, "LocaleSwitcher.astro"));

    expect(switcher).toContain("tplStr(t.a11y.notTranslated, { label })");
    expect(switcher).not.toContain("— not translated`");
    expect(switcher).not.toContain("(not translated)");
  });

  it("hides decorative icon components from assistive technology", () => {
    const iconFiles = astroFiles(components).filter(path =>
      /<Icon[A-Za-z0-9_]*\b/.test(read(path))
    );

    for (const path of iconFiles) {
      const icons = read(path).match(/<Icon[A-Za-z0-9_]*\b[\s\S]*?\/>/g) ?? [];
      expect(icons.length, path).toBeGreaterThan(0);
      for (const icon of icons) {
        expect(icon, `${path}: ${icon}`).toContain('aria-hidden="true"');
      }
    }
  });

  it("routes every new-tab anchor through the localized helper", () => {
    const directNewTabLinks = astroFiles(root).filter(
      path =>
        path !== resolve(components, "ExternalLink.astro") &&
        /target=["']_blank["']/.test(read(path))
    );
    const externalLink = read(resolve(components, "ExternalLink.astro"));

    expect(directNewTabLinks).toEqual([]);
    expect(externalLink).toContain('target="_blank"');
    expect(externalLink).toContain("t.link.opensInNewTab");
    expect(externalLink).toContain('class="sr-only"');
  });
});
