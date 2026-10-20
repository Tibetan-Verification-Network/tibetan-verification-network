import { bo } from "../../src/i18n/locales/bo";
import { en } from "../../src/i18n/locales/en";
import { otherLocale, pathFor, type Locale, type PublicRoute, type StaticSection } from "./routes";

const CATALOGS = { en, bo } as const;
const OG_LOCALE: Record<Locale, string> = { en: "en_US", bo: "bo_CN" };
const DESCRIPTION_LENGTH = 160;

export interface PageMeta {
  lang: Locale;
  title: string;
  description: string;
  canonical: string;
  alternates: { hreflang: string; href: string }[];
  ogType: "website" | "article";
  noindex: boolean;
}

export interface ArticleDetail {
  snapshot: {
    title: string;
    summary: string | null;
    claim_text: string;
    kind: string;
    withdrawal_notice: string | null;
  };
  translations: { language: string; status: string }[];
}

export interface TopicDetail {
  name_en: string;
  name_bo: string;
  description_en: string | null;
  description_bo: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Shorten on code point boundaries so Tibetan text is never cut mid-character. */
export function truncate(value: string, limit = DESCRIPTION_LENGTH): string {
  const flat = value.replace(/\s+/g, " ").trim();
  const points = Array.from(flat);
  if (points.length <= limit) {
    return flat;
  }
  return `${points
    .slice(0, limit - 1)
    .join("")
    .trimEnd()}…`;
}

export function siteName(locale: Locale): string {
  return CATALOGS[locale]["product.name"];
}

function withSite(locale: Locale, title: string): string {
  const site = siteName(locale);
  return title === site ? site : `${title} — ${site}`;
}

const STATIC_KEYS: Record<
  StaticSection,
  {
    title: keyof typeof en;
    description: keyof typeof en;
  }
> = {
  home: { title: "product.name", description: "home.lede" },
  search: { title: "search.title", description: "search.lead" },
  topics: { title: "topics.title", description: "topics.lead" },
  about: { title: "about.title", description: "about.mission.body" },
  submit: { title: "submit.title", description: "submit.lead" },
};

function alternatesFor(
  origin: string,
  route: PublicRoute,
  locales: readonly Locale[],
): PageMeta["alternates"] {
  const links = locales.map((locale) => ({
    hreflang: locale,
    href: `${origin}${pathFor(route, locale)}`,
  }));
  const fallback = locales.includes("en") ? "en" : locales[0];
  if (fallback === undefined) {
    return links;
  }
  return [...links, { hreflang: "x-default", href: `${origin}${pathFor(route, fallback)}` }];
}

export function staticMeta(
  origin: string,
  route: Extract<PublicRoute, { kind: "static" }>,
): PageMeta {
  const catalog = CATALOGS[route.locale];
  const keys = STATIC_KEYS[route.section];
  return {
    lang: route.locale,
    title: withSite(route.locale, catalog[keys.title]),
    description: truncate(catalog[keys.description]),
    canonical: `${origin}${pathFor(route)}`,
    alternates: alternatesFor(origin, route, ["en", "bo"]),
    ogType: "website",
    noindex: false,
  };
}

export function articleMeta(
  origin: string,
  route: Extract<PublicRoute, { kind: "article" | "version" }>,
  detail: ArticleDetail,
): PageMeta {
  const { snapshot } = detail;
  const withdrawn = snapshot.kind === "withdrawal";
  const published = new Set<Locale>([route.locale]);
  for (const link of detail.translations) {
    if ((link.language === "en" || link.language === "bo") && link.status === "published") {
      published.add(link.language);
    }
  }
  const other = otherLocale(route.locale);
  const locales = [route.locale, ...(published.has(other) ? [other] : [])];
  const catalog = CATALOGS[route.locale];
  const description = withdrawn
    ? truncate(snapshot.withdrawal_notice ?? catalog["article.withdrawn.title"])
    : truncate(snapshot.summary ?? snapshot.claim_text);
  return {
    lang: route.locale,
    title: withSite(route.locale, withdrawn ? catalog["article.withdrawn.title"] : snapshot.title),
    description,
    canonical: `${origin}${pathFor(route)}`,
    alternates: alternatesFor(origin, route, locales),
    ogType: "article",
    // Withdrawn articles and old versions stay reachable but should not be indexed.
    noindex: withdrawn || route.kind === "version",
  };
}

export function topicMeta(
  origin: string,
  route: Extract<PublicRoute, { kind: "topic" }>,
  topic: TopicDetail,
): PageMeta {
  const catalog = CATALOGS[route.locale];
  const name =
    route.locale === "bo" ? topic.name_bo || topic.name_en : topic.name_en || topic.name_bo;
  const description =
    (route.locale === "bo" ? topic.description_bo : topic.description_en) ??
    topic.description_en ??
    topic.description_bo ??
    catalog["topics.lead"];
  return {
    lang: route.locale,
    title: withSite(route.locale, name),
    description: truncate(description),
    canonical: `${origin}${pathFor(route)}`,
    alternates: alternatesFor(origin, route, ["en", "bo"]),
    ogType: "website",
    noindex: false,
  };
}

/** Meta for a public route whose content does not exist (or could not be loaded). */
export function missingMeta(origin: string, route: PublicRoute): PageMeta {
  const catalog = CATALOGS[route.locale];
  const title =
    route.kind === "topic" ? catalog["topics.notFound"] : catalog["article.notFound.title"];
  return {
    lang: route.locale,
    title: withSite(route.locale, title),
    description: truncate(catalog["home.lede"]),
    canonical: `${origin}${pathFor(route)}`,
    alternates: [],
    ogType: "website",
    noindex: true,
  };
}

/** Tags appended to `<head>`. Every value is escaped. */
export function headTags(meta: PageMeta): string {
  const tags = [
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`,
    ...meta.alternates.map(
      (link) =>
        `<link rel="alternate" hreflang="${escapeHtml(link.hreflang)}" href="${escapeHtml(link.href)}">`,
    ),
    `<meta property="og:type" content="${meta.ogType}">`,
    `<meta property="og:site_name" content="${escapeHtml(siteName(meta.lang))}">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}">`,
    `<meta property="og:locale" content="${OG_LOCALE[meta.lang]}">`,
    ...meta.alternates
      .filter((link) => link.hreflang !== "x-default" && link.hreflang !== meta.lang)
      .map(
        (link) =>
          `<meta property="og:locale:alternate" content="${OG_LOCALE[link.hreflang as Locale]}">`,
      ),
    `<meta name="twitter:card" content="summary">`,
  ];
  if (meta.noindex) {
    tags.push(`<meta name="robots" content="noindex">`);
  }
  return tags.join("\n");
}
