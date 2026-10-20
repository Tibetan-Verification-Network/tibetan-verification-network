import type {
  PublicCard,
  PublicDetail,
  PublicSnapshot,
  PublicTopic,
  VersionSummary,
} from "../api/public";

export const EDITOR = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@example.org",
  display_name: "Tenzin",
  roles: ["editor"],
  is_active: true,
};

export const CSRF = "csrf-memory-token-should-not-render";

export function makeCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    slug: "river-claim",
    language: "en",
    title: "Does the river run dry every winter?",
    summary: "A viral post says the river stops flowing each winter.",
    verdict: "false",
    topics: ["environment"],
    first_published_at: "2026-01-05T09:00:00Z",
    last_published_at: "2026-01-05T09:00:00Z",
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<PublicSnapshot> = {}): PublicSnapshot {
  return {
    schema_version: 2,
    language: "en",
    public_slug: "river-claim",
    title: "Does the river run dry every winter?",
    summary: "A viral post says the river stops flowing each winter.",
    claim_text: "The river stops flowing every winter.",
    context_text: "The post circulated in a group in December.",
    verdict: "false",
    verdict_explanation: "Gauge records show continuous flow.",
    analysis_markdown: "Analysis.",
    analysis_html: "<p>Gauge data from 2015 to 2025 shows flow in every month.</p>",
    limitations_markdown: "Limits.",
    limitations_html: "<p>Only one station was available.</p>",
    sources: [
      {
        title: "River gauge report",
        publisher: "Hydrology Office",
        url: "https://example.org/report",
        published_at: "2025-12-01T00:00:00Z",
        relevance_note: "Primary flow data",
      },
    ],
    topics: ["environment"],
    translation_status: "published",
    attribution: "Researched and reviewed by the Tibetan Verification Network.",
    kind: "initial",
    correction_note: null,
    withdrawal_notice: null,
    published_at: "2026-01-05T09:00:00Z",
    ...overrides,
  };
}

export function makeDetail(
  snapshot: PublicSnapshot,
  options: {
    translations?: PublicDetail["translations"];
    versions?: VersionSummary[];
  } = {},
): PublicDetail {
  return {
    snapshot,
    checksum: "abc123",
    translations: options.translations ?? [
      { language: snapshot.language, status: "published", slug: snapshot.public_slug },
      {
        language: snapshot.language === "en" ? "bo" : "en",
        status: "unavailable",
        slug: snapshot.public_slug,
      },
    ],
    versions: options.versions ?? [
      {
        version_number: 1,
        kind: "initial",
        published_at: snapshot.published_at,
        correction_note: null,
      },
    ],
  };
}

export const TOPIC: PublicTopic = {
  slug: "environment",
  name_en: "Environment",
  name_bo: "ཁོར་ཡུག",
  description_en: "Claims about land, water, and climate.",
  description_bo: null,
  published_count_en: 2,
  published_count_bo: 1,
};
