import type { FetchApi } from "./env";
import { escapeHtml } from "./meta";
import { LOCALES, isLocale, type Locale } from "./routes";

export interface SitemapArticle {
  slug: string;
  language: Locale;
  last_published_at: string;
}

export interface SitemapTopic {
  slug: string;
  published_count_en: number;
  published_count_bo: number;
}

interface UrlEntry {
  loc: string;
  lastmod?: string;
  alternates: { hreflang: string; href: string }[];
}

const STATIC_PAGES = ["", "/fact-checks", "/topics", "/about", "/submit"] as const;
const MAX_PAGES = 200;

function alternatesFor(
  origin: string,
  path: (locale: Locale) => string,
  locales: readonly Locale[],
) {
  const links = locales.map((locale) => ({ hreflang: locale, href: `${origin}${path(locale)}` }));
  const first = locales.includes("en") ? "en" : locales[0];
  return first === undefined
    ? links
    : [...links, { hreflang: "x-default", href: `${origin}${path(first)}` }];
}

export function buildSitemap(
  origin: string,
  articles: readonly SitemapArticle[],
  topics: readonly SitemapTopic[],
): string {
  const entries: UrlEntry[] = [];

  for (const page of STATIC_PAGES) {
    const path = (locale: Locale) => `/${locale}${page}`;
    for (const locale of LOCALES) {
      entries.push({
        loc: `${origin}${path(locale)}`,
        alternates: alternatesFor(origin, path, LOCALES),
      });
    }
  }

  for (const topic of topics) {
    const locales = LOCALES.filter((locale) =>
      locale === "en" ? topic.published_count_en > 0 : topic.published_count_bo > 0,
    );
    const path = (locale: Locale) => `/${locale}/topics/${encodeURIComponent(topic.slug)}`;
    for (const locale of locales) {
      entries.push({
        loc: `${origin}${path(locale)}`,
        alternates: alternatesFor(origin, path, locales),
      });
    }
  }

  const bySlug = new Map<string, Map<Locale, string>>();
  for (const article of articles) {
    const languages = bySlug.get(article.slug) ?? new Map<Locale, string>();
    languages.set(article.language, article.last_published_at);
    bySlug.set(article.slug, languages);
  }
  for (const [slug, languages] of [...bySlug.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const locales = LOCALES.filter((locale) => languages.has(locale));
    const path = (locale: Locale) => `/${locale}/fact-checks/${encodeURIComponent(slug)}`;
    for (const locale of locales) {
      entries.push({
        loc: `${origin}${path(locale)}`,
        lastmod: languages.get(locale),
        alternates: alternatesFor(origin, path, locales),
      });
    }
  }

  const body = entries
    .map((entry) => {
      const links = entry.alternates
        .map(
          (link) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeHtml(link.hreflang)}" href="${escapeHtml(link.href)}"/>`,
        )
        .join("\n");
      const lastmod = entry.lastmod ? `\n    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeHtml(entry.loc)}</loc>${lastmod}\n${links}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`;
}

interface ListPage {
  items: { slug: string; language: string; last_published_at: string }[];
  next_cursor: string | null;
}

/** Page through the public list for one language. Withdrawn articles are never listed. */
export async function collectArticles(
  fetchApi: FetchApi,
  language: Locale,
): Promise<SitemapArticle[]> {
  const found: SitemapArticle[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ lang: language, limit: "50" });
    if (cursor !== null) {
      query.set("cursor", cursor);
    }
    const response = await fetchApi(`/api/v1/factchecks?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`Public list returned ${response.status}`);
    }
    const body = (await response.json()) as ListPage;
    for (const item of body.items) {
      if (isLocale(item.language)) {
        found.push({
          slug: item.slug,
          language: item.language,
          last_published_at: item.last_published_at,
        });
      }
    }
    if (body.next_cursor === null) {
      return found;
    }
    cursor = body.next_cursor;
  }
  return found;
}

export async function collectTopics(fetchApi: FetchApi): Promise<SitemapTopic[]> {
  const response = await fetchApi("/api/v1/topics");
  if (!response.ok) {
    throw new Error(`Public topics returned ${response.status}`);
  }
  return ((await response.json()) as { items: SitemapTopic[] }).items;
}
