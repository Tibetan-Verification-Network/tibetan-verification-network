import { vi } from "vitest";

import type { PublicCard, PublicDetail, PublicSnapshot, PublicTopic } from "../api/public";
import type { Locale } from "../i18n/translate";
import { makeCard, makeDetail, makeSnapshot, TOPIC } from "./fixtures";

export function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.href;
  }
  if (typeof input === "string") {
    return input;
  }
  return input.url;
}

export interface RouteResult {
  status: number;
  body?: unknown;
}

export function installFetch(
  handler: (url: string, init: RequestInit) => RouteResult | Promise<RouteResult>,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = await handler(requestUrl(input), init ?? {});
    if (result.status === 204) {
      return new Response(null, { status: 204 });
    }
    return Response.json(result.body ?? {}, { status: result.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export interface PublicDataset {
  cards: PublicCard[];
  topics: PublicTopic[];
  /** Live detail per slug and language. A missing entry answers 404. */
  details: Record<string, Partial<Record<Locale, PublicDetail>>>;
  /** Prior versions keyed by `slug:lang:n`. */
  versions: Record<string, PublicSnapshot>;
}

const NOT_FOUND: RouteResult = { status: 404, body: { detail: "Not Found" } };

export function defaultDataset(): PublicDataset {
  const river = makeSnapshot();
  const riverBo = makeSnapshot({
    language: "bo",
    title: "ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།",
    summary: null,
    claim_text: "ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ།",
    verdict_explanation: "ཆུ་ཚད་ཀྱི་ཟིན་ཐོས་རྒྱུན་མཐུད་ཡོད།",
  });
  const pending = makeSnapshot({
    public_slug: "pending-claim",
    title: "A claim with no Tibetan translation yet",
    verdict: "misleading",
  });
  const withdrawn = makeSnapshot({
    public_slug: "withdrawn-claim",
    title: "A claim that was withdrawn",
    kind: "withdrawal",
    withdrawal_notice: "Withdrawn because a source was retracted.",
    published_at: "2026-03-01T00:00:00Z",
  });
  const corrected = makeSnapshot({
    public_slug: "corrected-claim",
    title: "A corrected fact-check",
    kind: "correction",
    correction_note: "Fixed the year of the first report.",
    published_at: "2026-02-20T00:00:00Z",
  });
  return {
    cards: [
      makeCard(),
      makeCard({
        slug: "river-claim",
        language: "bo",
        title: riverBo.title,
        summary: null,
        verdict: "false",
      }),
      makeCard({
        slug: "pending-claim",
        title: pending.title,
        verdict: "misleading",
        topics: [],
        first_published_at: "2026-01-04T09:00:00Z",
        last_published_at: "2026-01-04T09:00:00Z",
      }),
    ],
    topics: [TOPIC],
    details: {
      "river-claim": {
        en: makeDetail(river, {
          translations: [
            { language: "en", status: "published", slug: "river-claim" },
            { language: "bo", status: "published", slug: "river-claim" },
          ],
        }),
        bo: makeDetail(riverBo, {
          translations: [
            { language: "bo", status: "published", slug: "river-claim" },
            { language: "en", status: "published", slug: "river-claim" },
          ],
        }),
      },
      "pending-claim": {
        en: makeDetail(pending, {
          translations: [
            { language: "en", status: "published", slug: "pending-claim" },
            { language: "bo", status: "pending", slug: "pending-claim" },
          ],
        }),
      },
      "withdrawn-claim": { en: makeDetail(withdrawn) },
      "corrected-claim": {
        en: makeDetail(corrected, {
          versions: [
            {
              version_number: 1,
              kind: "initial",
              published_at: "2026-01-05T09:00:00Z",
              correction_note: null,
            },
            {
              version_number: 2,
              kind: "correction",
              published_at: "2026-02-20T00:00:00Z",
              correction_note: "Fixed the year of the first report.",
            },
          ],
        }),
      },
    },
    versions: {
      "corrected-claim:en:1": makeSnapshot({
        public_slug: "corrected-claim",
        title: "A corrected fact-check",
      }),
    },
  };
}

function listResponse(dataset: PublicDataset, params: URLSearchParams): RouteResult {
  const lang = params.get("lang");
  const verdict = params.get("verdict");
  const topic = params.get("topic");
  const q = params.get("q")?.toLowerCase();
  const limit = Number(params.get("limit") ?? "20");
  const offset = Number((params.get("cursor") ?? "offset:0").replace("offset:", ""));
  const matches = dataset.cards.filter(
    (card) =>
      (lang === null || card.language === lang) &&
      (verdict === null || card.verdict === verdict) &&
      (topic === null || card.topics.includes(topic)) &&
      (q === undefined || card.title.toLowerCase().includes(q)),
  );
  const items = matches.slice(offset, offset + limit);
  const next = offset + limit < matches.length ? `offset:${offset + limit}` : null;
  return { status: 200, body: { items, next_cursor: next } };
}

/** Anonymous visitor: public reads and submissions work, staff endpoints answer 401. */
export function installPublicApi(overrides: Partial<PublicDataset> = {}) {
  const dataset = { ...defaultDataset(), ...overrides };
  return installFetch((rawUrl, init) => {
    const url = new URL(rawUrl);
    const path = url.pathname;
    if (path === "/ready") {
      return { status: 200, body: { status: "ready" } };
    }
    if (path === "/api/v1/me") {
      return { status: 401, body: { detail: "Authentication required" } };
    }
    if (path === "/api/v1/submissions" && init.method === "POST") {
      return { status: 202, body: { receipt_id: "00000000-0000-4000-8000-000000000000" } };
    }
    if (path === "/api/v1/factchecks") {
      return listResponse(dataset, url.searchParams);
    }
    const version = /^\/api\/v1\/factchecks\/([^/]+)\/versions\/(\d+)$/.exec(path);
    if (version) {
      const key = `${decodeURIComponent(version[1] ?? "")}:${url.searchParams.get("lang")}:${version[2]}`;
      const found = dataset.versions[key];
      return found ? { status: 200, body: found } : NOT_FOUND;
    }
    const detail = /^\/api\/v1\/factchecks\/([^/]+)$/.exec(path);
    if (detail) {
      const slug = decodeURIComponent(detail[1] ?? "");
      const lang = url.searchParams.get("lang") === "bo" ? "bo" : "en";
      const found = dataset.details[slug]?.[lang];
      return found ? { status: 200, body: found } : NOT_FOUND;
    }
    if (path === "/api/v1/topics") {
      return { status: 200, body: { items: dataset.topics } };
    }
    const topic = /^\/api\/v1\/topics\/([^/]+)$/.exec(path);
    if (topic) {
      const found = dataset.topics.find(
        (entry) => entry.slug === decodeURIComponent(topic[1] ?? ""),
      );
      return found ? { status: 200, body: { ...found, recent: [] } } : NOT_FOUND;
    }
    throw new Error(`Unhandled fetch ${rawUrl}`);
  });
}

export const installAnonymousApi = installPublicApi;
