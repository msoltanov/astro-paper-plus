import { describe, expect, it } from "vitest";
import { useTranslations } from "@/i18n";
import { projectStatusLabel } from "@/utils/projectStatusLabel";

describe("projectStatusLabel", () => {
  it.each([
    ["en", ["Shipped", "In progress", "Archived"]],
    ["ru", ["Завершён", "В работе", "В архиве"]],
    ["tr", ["Yayında", "Devam ediyor", "Arşivlendi"]],
  ] as const)("localizes every status in %s", (locale, expected) => {
    const translations = useTranslations(locale).project;

    expect(projectStatusLabel("shipped", translations)).toBe(expected[0]);
    expect(projectStatusLabel("in-progress", translations)).toBe(expected[1]);
    expect(projectStatusLabel("archived", translations)).toBe(expected[2]);
  });
});
