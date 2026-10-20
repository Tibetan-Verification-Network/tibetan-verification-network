import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useAuth } from "../auth/useAuth";
import type { Locale } from "../i18n/translate";
import {
  fetchFactCheck,
  fetchFactCheckVersion,
  fetchFactChecks,
  fetchTopic,
  fetchTopics,
  type ListParams,
} from "./public";

/** `params.cursor` is managed by the query itself and must not be passed in. */
export function useFactCheckList(params: Omit<ListParams, "cursor">) {
  const { baseUrl } = useAuth();
  return useInfiniteQuery({
    queryKey: ["public", "factchecks", params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchFactChecks(baseUrl, { ...params, cursor: pageParam }, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function useFactCheck(slug: string, lang: Locale, enabled = true) {
  const { baseUrl } = useAuth();
  return useQuery({
    queryKey: ["public", "factcheck", slug, lang],
    queryFn: ({ signal }) => fetchFactCheck(baseUrl, slug, lang, signal),
    enabled,
  });
}

export function useFactCheckVersion(slug: string, lang: Locale, versionNumber: number) {
  const { baseUrl } = useAuth();
  return useQuery({
    enabled: versionNumber >= 1,
    queryKey: ["public", "factcheck", slug, lang, "version", versionNumber],
    queryFn: ({ signal }) => fetchFactCheckVersion(baseUrl, slug, lang, versionNumber, signal),
  });
}

export function useTopics() {
  const { baseUrl } = useAuth();
  return useQuery({
    queryKey: ["public", "topics"],
    queryFn: ({ signal }) => fetchTopics(baseUrl, signal),
  });
}

export function useTopic(slug: string) {
  const { baseUrl } = useAuth();
  return useQuery({
    queryKey: ["public", "topic", slug],
    queryFn: ({ signal }) => fetchTopic(baseUrl, slug, signal),
  });
}
