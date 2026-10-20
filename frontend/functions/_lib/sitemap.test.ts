import { describe, expect, it } from "vitest";

import { buildRobots } from "./robots";
import { buildSitemap, collectArticles, type SitemapArticle } from "./sitemap";

const ORIGIN = "https://example.org";

describe("buildSitemap", () => {
  const articles: SitemapArticle[] = [
    { slug: "river-claim", language: "en", last_published_at: "2026-02-10T00:00:00Z" },
    { slug: "river-claim", language: "bo", last_published_at: "2026-02-11T00:00:00Z" },
    { slug: "only-english", language: "en", last_published_at: "2026-01-01T00:00:00Z" },
  ];

  it("lists static pages and published articles in each language with alternates", () => {
    const xml = buildSitemap(ORIGIN, articles, []);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const path of ["/en", "/bo", "/en/fact-checks", "/bo/about", "/en/submit", "/bo/topics"]) {
      expect(xml).toContain(`<loc>${ORIGIN}${path}</loc>`);
    }
    expect(xml).toContain(`<loc>${ORIGIN}/en/fact-checks/river-claim</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/bo/fact-checks/river-claim</loc>`);
    expect(xml).toContain("<lastmod>2026-02-11T00:00:00Z</lastmod>");
    expect(xml).not.toContain("/versions/");
  });

  it("only links alternates that exist", () => {
    const xml = buildSitemap(ORIGIN, articles, []);
    const block = xml
      .split("<url>")
      .find((entry) => entry.includes("/en/fact-checks/only-english"));
    expect(block).toBeDefined();
    expect(block).not.toContain("/bo/fact-checks/only-english");
    expect(block).toContain('hreflang="x-default"');
    expect(xml).not.toContain(`${ORIGIN}/bo/fact-checks/only-english`);
  });

  it("lists only topics that have published articles, per language", () => {
    const xml = buildSitemap(
      ORIGIN,
      [],
      [
        { slug: "environment", published_count_en: 2, published_count_bo: 0 },
        { slug: "empty", published_count_en: 0, published_count_bo: 0 },
      ],
    );
    expect(xml).toContain(`${ORIGIN}/en/topics/environment`);
    expect(xml).not.toContain(`${ORIGIN}/bo/topics/environment`);
    expect(xml).not.toContain("/topics/empty");
  });

  it("escapes slugs", () => {
    const xml = buildSitemap(
      ORIGIN,
      [{ slug: 'a&b"<c>', language: "en", last_published_at: "2026-01-01T00:00:00Z" }],
      [],
    );
    expect(xml).not.toContain('a&b"<c>');
    expect(xml).toContain("a%26b%22%3Cc%3E");
  });
});

describe("collectArticles", () => {
  it("follows cursors until the list ends", async () => {
    const requested: string[] = [];
    const pages: Record<string, unknown> = {
      "": {
        items: [{ slug: "a", language: "en", last_published_at: "2026-01-02T00:00:00Z" }],
        next_cursor: "next",
      },
      next: {
        items: [{ slug: "b", language: "en", last_published_at: "2026-01-01T00:00:00Z" }],
        next_cursor: null,
      },
    };
    const found = await collectArticles(async (path) => {
      requested.push(path);
      const cursor = new URL(path, "https://api.example.org").searchParams.get("cursor") ?? "";
      return Response.json(pages[cursor]);
    }, "en");
    expect(found.map((item) => item.slug)).toEqual(["a", "b"]);
    expect(requested[0]).toContain("lang=en");
    expect(requested[1]).toContain("cursor=next");
  });

  it("fails loudly when the API errors, so a partial sitemap is never served", async () => {
    await expect(
      collectArticles(async () => new Response("no", { status: 500 }), "en"),
    ).rejects.toThrow();
  });
});

describe("buildRobots", () => {
  it("disallows staff pages and points at the sitemap", () => {
    const robots = buildRobots(ORIGIN);
    expect(robots).toContain("Disallow: /editorial");
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).not.toContain("Disallow: /en");
  });
});
