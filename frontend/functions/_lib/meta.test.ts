import { describe, expect, it } from "vitest";

import { bo } from "../../src/i18n/locales/bo";
import { en } from "../../src/i18n/locales/en";
import {
  articleMeta,
  escapeHtml,
  headTags,
  missingMeta,
  staticMeta,
  topicMeta,
  truncate,
} from "./meta";
import { parsePublicPath } from "./routes";

const ORIGIN = "https://example.org";

function route(path: string) {
  const parsed = parsePublicPath(path);
  if (parsed === null) {
    throw new Error(`not a public route: ${path}`);
  }
  return parsed;
}

function detail(overrides: { kind?: string; notice?: string | null } = {}) {
  return {
    snapshot: {
      title: "Does the river run dry?",
      summary: "A viral post claims the river dries up.",
      claim_text: "The river stops flowing every winter.",
      kind: overrides.kind ?? "initial",
      withdrawal_notice: overrides.notice ?? null,
    },
    translations: [
      { language: "en", status: "published" },
      { language: "bo", status: "published" },
    ],
  };
}

describe("parsePublicPath", () => {
  it("recognises locale-prefixed public routes", () => {
    expect(parsePublicPath("/en")).toEqual({ kind: "static", locale: "en", section: "home" });
    expect(parsePublicPath("/bo/")).toEqual({ kind: "static", locale: "bo", section: "home" });
    expect(parsePublicPath("/en/fact-checks")).toEqual({
      kind: "static",
      locale: "en",
      section: "search",
    });
    expect(parsePublicPath("/bo/about")).toMatchObject({ section: "about" });
    expect(parsePublicPath("/en/fact-checks/river-claim")).toEqual({
      kind: "article",
      locale: "en",
      slug: "river-claim",
    });
    expect(parsePublicPath("/en/fact-checks/river-claim/versions/2")).toEqual({
      kind: "version",
      locale: "en",
      slug: "river-claim",
      version: 2,
    });
    expect(parsePublicPath("/bo/topics/environment")).toEqual({
      kind: "topic",
      locale: "bo",
      slug: "environment",
    });
  });

  it("ignores everything else", () => {
    for (const path of [
      "/",
      "/editorial",
      "/editorial/inbox",
      "/login",
      "/fr/about",
      "/en/unknown",
      "/en/fact-checks/a/b",
      "/en/fact-checks/a/versions/x",
      "/en/fact-checks/a/versions/0",
      "/en/fact-checks/%E0%A4%A",
      "/assets/index.js",
    ]) {
      expect(parsePublicPath(path), path).toBeNull();
    }
  });
});

describe("page meta", () => {
  it("builds static meta from the same catalogs the app uses", () => {
    const meta = staticMeta(ORIGIN, { kind: "static", locale: "bo", section: "search" });
    expect(meta.lang).toBe("bo");
    expect(meta.title).toBe(`${bo["search.title"]} — ${bo["product.name"]}`);
    expect(meta.description).toBe(bo["search.lead"]);
    expect(meta.canonical).toBe("https://example.org/bo/fact-checks");
    expect(meta.alternates).toEqual([
      { hreflang: "en", href: "https://example.org/en/fact-checks" },
      { hreflang: "bo", href: "https://example.org/bo/fact-checks" },
      { hreflang: "x-default", href: "https://example.org/en/fact-checks" },
    ]);
    expect(meta.noindex).toBe(false);
  });

  it("uses the bare product name as the home title", () => {
    const meta = staticMeta(ORIGIN, { kind: "static", locale: "en", section: "home" });
    expect(meta.title).toBe(en["product.name"]);
    expect(meta.canonical).toBe("https://example.org/en");
  });

  it("builds article meta with a summary description and hreflang alternates", () => {
    const meta = articleMeta(ORIGIN, route("/en/fact-checks/river-claim") as never, detail());
    expect(meta.title).toBe("Does the river run dry? — Tibetan Verification Network");
    expect(meta.description).toBe("A viral post claims the river dries up.");
    expect(meta.canonical).toBe("https://example.org/en/fact-checks/river-claim");
    expect(meta.ogType).toBe("article");
    expect(meta.alternates.map((link) => link.hreflang)).toEqual(["en", "bo", "x-default"]);
    expect(meta.noindex).toBe(false);
  });

  it("falls back to the claim text and only links translations that are published", () => {
    const base = detail();
    const meta = articleMeta(ORIGIN, route("/en/fact-checks/river-claim") as never, {
      snapshot: { ...base.snapshot, summary: null },
      translations: [
        { language: "en", status: "published" },
        { language: "bo", status: "pending" },
      ],
    });
    expect(meta.description).toBe("The river stops flowing every winter.");
    expect(meta.alternates.map((link) => link.hreflang)).toEqual(["en", "x-default"]);
  });

  it("marks withdrawn articles and old versions noindex without leaking the body", () => {
    const withdrawn = articleMeta(
      ORIGIN,
      route("/en/fact-checks/river-claim") as never,
      detail({ kind: "withdrawal", notice: "Withdrawn because a source was retracted." }),
    );
    expect(withdrawn.noindex).toBe(true);
    expect(withdrawn.title).toBe(`${en["article.withdrawn.title"]} — ${en["product.name"]}`);
    expect(withdrawn.description).toBe("Withdrawn because a source was retracted.");
    expect(withdrawn.title).not.toContain("river");

    const version = articleMeta(
      ORIGIN,
      route("/en/fact-checks/river-claim/versions/1") as never,
      detail(),
    );
    expect(version.noindex).toBe(true);
    expect(version.canonical).toBe("https://example.org/en/fact-checks/river-claim");
  });

  it("builds topic meta in the reader's language", () => {
    const meta = topicMeta(ORIGIN, route("/bo/topics/environment") as never, {
      name_en: "Environment",
      name_bo: "ཁོར་ཡུག",
      description_en: "Claims about land.",
      description_bo: null,
    });
    expect(meta.title).toBe(`ཁོར་ཡུག — ${bo["product.name"]}`);
    expect(meta.description).toBe("Claims about land.");
  });

  it("marks missing content noindex", () => {
    const meta = missingMeta(ORIGIN, route("/en/fact-checks/guess"));
    expect(meta.noindex).toBe(true);
    expect(meta.title).toContain(en["article.notFound.title"]);
    expect(headTags(meta)).toContain('<meta name="robots" content="noindex">');
  });

  it("truncates on code point boundaries", () => {
    const tibetan = "བོད་ཡིག་".repeat(60);
    const short = truncate(tibetan);
    expect(Array.from(short)).toHaveLength(160);
    expect(short.endsWith("…")).toBe(true);
    expect(truncate("short  text\n here")).toBe("short text here");
  });

  it("escapes every value placed in markup", () => {
    const hostile = '"><script>alert(1)</script>&';
    const tags = headTags({
      lang: "en",
      title: hostile,
      description: hostile,
      canonical: `https://example.org/en?x=${hostile}`,
      alternates: [{ hreflang: "en", href: hostile }],
      ogType: "article",
      noindex: false,
    });
    expect(tags).not.toContain("<script>");
    expect(tags).toContain("&lt;script&gt;");
    expect(escapeHtml(`'"&<>`)).toBe("&#39;&quot;&amp;&lt;&gt;");
  });

  it("emits canonical, hreflang, and Open Graph tags", () => {
    const tags = headTags(staticMeta(ORIGIN, { kind: "static", locale: "bo", section: "about" }));
    expect(tags).toContain('<link rel="canonical" href="https://example.org/bo/about">');
    expect(tags).toContain(
      '<link rel="alternate" hreflang="en" href="https://example.org/en/about">',
    );
    expect(tags).toContain('hreflang="x-default"');
    expect(tags).toContain('<meta property="og:locale" content="bo_CN">');
    expect(tags).toContain('<meta property="og:locale:alternate" content="en_US">');
    expect(tags).toContain('<meta property="og:type" content="website">');
    expect(tags).not.toContain("noindex");
  });
});
