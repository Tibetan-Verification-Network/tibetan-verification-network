import type { MessageKey } from "./locales/en";
import { en } from "./locales/en";
import { bo } from "./locales/bo";

export const LOCALES = ["en", "bo"] as const;
export type Locale = (typeof LOCALES)[number];

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, bo };

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "bo";
}

export function messageOrFallback(localized: string | undefined, fallback: string): string {
  if (localized === undefined || localized.trim() === "") {
    return fallback;
  }
  return localized;
}

export function formatMessage(template: string, values?: Record<string, string>): string {
  if (values === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : value;
  });
}

export function translate(
  locale: Locale,
  key: MessageKey,
  values?: Record<string, string>,
): string {
  const template = messageOrFallback(catalogs[locale][key], catalogs.en[key]);
  return formatMessage(template, values);
}

export function chooseLocale(stored: string | null, languages: readonly string[]): Locale {
  if (isLocale(stored)) {
    return stored;
  }
  for (const candidate of languages) {
    const base = candidate.toLowerCase().split("-")[0];
    if (base === "bo") {
      return "bo";
    }
  }
  return "en";
}
