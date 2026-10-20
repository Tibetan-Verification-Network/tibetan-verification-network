import { isLocale, type Locale } from "./translate";

/** Build a locale-prefixed public path such as `/bo/fact-checks`. */
export function localePath(locale: Locale, path = ""): string {
  const suffix = path === "" || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${suffix}`;
}

/** Return the locale prefix of a pathname, or null for unprefixed paths. */
export function pathLocale(pathname: string): Locale | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

/** Swap the locale prefix of a public pathname. Returns null when it has no prefix. */
export function swapLocale(pathname: string, next: Locale): string | null {
  if (pathLocale(pathname) === null) {
    return null;
  }
  return `/${next}${pathname.slice(3)}`;
}
