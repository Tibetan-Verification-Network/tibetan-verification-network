import type { Locale } from "../i18n/translate";
import { ApiError } from "./types";

export const VERDICTS = ["true", "false", "misleading", "unverified", "unclear"] as const;
export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && VERDICTS.some((verdict) => verdict === value);
}

export type VersionKind = "initial" | "correction" | "update" | "clarification" | "withdrawal";

export interface PublicCard {
  slug: string;
  language: Locale;
  title: string;
  summary: string | null;
  verdict: Verdict;
  topics: string[];
  first_published_at: string;
  last_published_at: string;
}

export interface PublicList {
  items: PublicCard[];
  next_cursor: string | null;
}

export interface PublicSource {
  title: string;
  publisher: string | null;
  url: string | null;
  published_at: string | null;
  relevance_note: string | null;
}

export interface PublicSnapshot {
  schema_version: number;
  language: Locale;
  public_slug: string;
  title: string;
  summary: string | null;
  claim_text: string;
  context_text: string;
  verdict: Verdict;
  verdict_explanation: string;
  analysis_markdown: string;
  analysis_html: string;
  limitations_markdown: string;
  limitations_html: string;
  sources: PublicSource[];
  topics: string[];
  translation_status: "pending" | "in_review" | "published" | "unavailable";
  attribution: string;
  kind: VersionKind;
  correction_note: string | null;
  withdrawal_notice: string | null;
  published_at: string;
}

export interface TranslationLink {
  language: Locale;
  status: "published" | "pending" | "unavailable";
  slug: string | null;
}

export interface VersionSummary {
  version_number: number;
  kind: VersionKind;
  published_at: string;
  correction_note: string | null;
}

export interface PublicDetail {
  snapshot: PublicSnapshot;
  checksum: string;
  translations: TranslationLink[];
  versions: VersionSummary[];
}

export interface PublicTopic {
  slug: string;
  name_bo: string;
  name_en: string;
  description_bo: string | null;
  description_en: string | null;
  published_count_en: number;
  published_count_bo: number;
}

export interface PublicTopicList {
  items: PublicTopic[];
}

export interface PublicTopicDetail extends PublicTopic {
  recent: PublicCard[];
}

export interface ListParams {
  q?: string;
  lang?: Locale;
  verdict?: string;
  topic?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Anonymous GET against the public API. No cookies are sent, so these reads stay cacheable
 * and never depend on a staff session.
 */
export async function publicGet<T>(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
    throw new ApiError(0, "errors.network");
  }
  if (!response.ok) {
    throw new ApiError(response.status, "errors.generic");
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "errors.generic");
  }
}

export function fetchFactChecks(
  baseUrl: string,
  params: ListParams,
  signal?: AbortSignal,
): Promise<PublicList> {
  return publicGet<PublicList>(baseUrl, "/api/v1/factchecks", { ...params }, signal);
}

export function fetchFactCheck(
  baseUrl: string,
  slug: string,
  lang: Locale,
  signal?: AbortSignal,
): Promise<PublicDetail> {
  return publicGet<PublicDetail>(
    baseUrl,
    `/api/v1/factchecks/${encodeURIComponent(slug)}`,
    { lang },
    signal,
  );
}

export function fetchFactCheckVersion(
  baseUrl: string,
  slug: string,
  lang: Locale,
  versionNumber: number,
  signal?: AbortSignal,
): Promise<PublicSnapshot> {
  return publicGet<PublicSnapshot>(
    baseUrl,
    `/api/v1/factchecks/${encodeURIComponent(slug)}/versions/${versionNumber}`,
    { lang },
    signal,
  );
}

export function fetchTopics(baseUrl: string, signal?: AbortSignal): Promise<PublicTopicList> {
  return publicGet<PublicTopicList>(baseUrl, "/api/v1/topics", {}, signal);
}

export function fetchTopic(
  baseUrl: string,
  slug: string,
  signal?: AbortSignal,
): Promise<PublicTopicDetail> {
  return publicGet<PublicTopicDetail>(
    baseUrl,
    `/api/v1/topics/${encodeURIComponent(slug)}`,
    {},
    signal,
  );
}

export function topicName(topic: PublicTopic, locale: Locale): string {
  const preferred = locale === "bo" ? topic.name_bo : topic.name_en;
  const fallback = locale === "bo" ? topic.name_en : topic.name_bo;
  return preferred.trim() === "" ? fallback : preferred;
}

export function topicDescription(topic: PublicTopic, locale: Locale): string | null {
  const preferred = locale === "bo" ? topic.description_bo : topic.description_en;
  const fallback = locale === "bo" ? topic.description_en : topic.description_bo;
  const value = preferred ?? fallback;
  return value === null || value.trim() === "" ? null : value;
}

export function topicCount(topic: PublicTopic, locale: Locale): number {
  return locale === "bo" ? topic.published_count_bo : topic.published_count_en;
}
