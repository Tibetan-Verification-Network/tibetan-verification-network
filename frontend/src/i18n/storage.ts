import { chooseLocale, isLocale, type Locale } from "./translate";

export const LOCALE_STORAGE_KEY = "tvn.locale";

export function readStoredLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persistence is best-effort. The selected locale still applies in memory.
  }
}

export function detectLocale(): Locale {
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return chooseLocale(readStoredLocale(), languages);
}
