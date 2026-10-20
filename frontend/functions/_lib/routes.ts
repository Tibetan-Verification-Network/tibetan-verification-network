export const LOCALES = ["en", "bo"] as const;
export type Locale = (typeof LOCALES)[number];

export type StaticSection = "home" | "search" | "topics" | "about" | "submit";

export type PublicRoute =
  | { kind: "static"; locale: Locale; section: StaticSection }
  | { kind: "article"; locale: Locale; slug: string }
  | { kind: "version"; locale: Locale; slug: string; version: number }
  | { kind: "topic"; locale: Locale; slug: string };

const STATIC_PATHS: Record<string, StaticSection> = {
  "": "home",
  "fact-checks": "search",
  topics: "topics",
  about: "about",
  submit: "submit",
};

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "bo";
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Parse a locale-prefixed public pathname. Returns null for anything else. */
export function parsePublicPath(pathname: string): PublicRoute | null {
  const segments = pathname.split("/").filter((segment, index) => index === 0 || segment !== "");
  // segments[0] is the empty string before the first slash.
  const rest = segments.slice(1);
  const locale = rest[0];
  if (!isLocale(locale)) {
    return null;
  }
  const tail = rest.slice(1);
  const section = tail.length <= 1 ? STATIC_PATHS[tail[0] ?? ""] : undefined;
  if (section !== undefined) {
    return { kind: "static", locale, section };
  }
  if (tail[0] === "fact-checks" && tail.length === 2) {
    const slug = decode(tail[1] ?? "");
    return slug === null || slug === "" ? null : { kind: "article", locale, slug };
  }
  if (tail[0] === "fact-checks" && tail.length === 4 && tail[2] === "versions") {
    const slug = decode(tail[1] ?? "");
    const version = /^\d+$/.test(tail[3] ?? "") ? Number(tail[3]) : 0;
    return slug === null || slug === "" || version < 1
      ? null
      : { kind: "version", locale, slug, version };
  }
  if (tail[0] === "topics" && tail.length === 2) {
    const slug = decode(tail[1] ?? "");
    return slug === null || slug === "" ? null : { kind: "topic", locale, slug };
  }
  return null;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "bo" : "en";
}

/** Canonical path of a route within its own locale. */
export function pathFor(route: PublicRoute, locale: Locale = route.locale): string {
  switch (route.kind) {
    case "static": {
      const suffix = Object.entries(STATIC_PATHS).find(([, section]) => section === route.section);
      const tail = suffix?.[0] ?? "";
      return tail === "" ? `/${locale}` : `/${locale}/${tail}`;
    }
    case "article":
    case "version":
      return `/${locale}/fact-checks/${encodeURIComponent(route.slug)}`;
    case "topic":
      return `/${locale}/topics/${encodeURIComponent(route.slug)}`;
  }
}
