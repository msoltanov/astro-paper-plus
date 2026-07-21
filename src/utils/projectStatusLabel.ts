import type { CollectionEntry } from "astro:content";
import type { UIStrings } from "@/i18n/types";

type ProjectStatus = CollectionEntry<"projects">["data"]["status"];
type ProjectTranslations = Pick<
  UIStrings["project"],
  "statusShipped" | "statusInProgress" | "statusArchived"
>;

export function projectStatusLabel(
  status: ProjectStatus,
  translations: ProjectTranslations
): string {
  switch (status) {
    case "shipped":
      return translations.statusShipped;
    case "in-progress":
      return translations.statusInProgress;
    case "archived":
      return translations.statusArchived;
  }
}
