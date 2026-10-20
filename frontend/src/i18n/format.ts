import type { Locale } from "./translate";

/** Format an ISO timestamp as a long calendar date in the given locale (UTC). */
export function formatDate(locale: Locale, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
