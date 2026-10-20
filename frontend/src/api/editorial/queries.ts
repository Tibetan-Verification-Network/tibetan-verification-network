import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuth } from "../../auth/useAuth";
import { useNotify } from "../../editorial/components/useNotify";
import type { MessageKey } from "../../i18n/locales/en";
import type { Locale } from "../../i18n/translate";
import { apiRequest } from "../client";
import type {
  AccessLink,
  ArchiveDocument,
  ArchiveGrant,
  AuditEvent,
  AuditSubject,
  Claim,
  Draft,
  EditorialTopic,
  FactCheckDetail,
  FactCheckListItem,
  InvestigationDetail,
  InvestigationListItem,
  Page,
  PublishPreview,
  QueueItem,
  Readiness,
  Review,
  StaffMember,
  Submission,
  SubmissionContact,
  SubmissionDetail,
  UserSummary,
  VersionDetail,
  VersionRow,
} from "./types";

export const EDITORIAL_KEY = "editorial";

type Params = Record<string, string | number | boolean | undefined | null>;

export function withParams(path: string, params: Params = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text === "" ? path : `${path}?${text}`;
}

export interface EditorialApi {
  get: <T>(path: string, signal?: AbortSignal) => Promise<T>;
  send: <T>(
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ) => Promise<T>;
  upload: <T>(path: string, form: FormData) => Promise<T>;
}

/** Authenticated calls to the staff API. The CSRF header is added by `apiRequest`. */
export function useApi(): EditorialApi {
  const { baseUrl } = useAuth();
  return useMemo(
    () => ({
      get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(baseUrl, path, { signal }),
      send: <T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) =>
        apiRequest<T>(baseUrl, path, { method, body }),
      upload: <T>(path: string, form: FormData) =>
        apiRequest<T>(baseUrl, path, { method: "POST", body: form }),
    }),
    [baseUrl],
  );
}

function useEditorialQuery<T>(
  key: readonly unknown[],
  path: string | null,
  options: { enabled?: boolean; fresh?: boolean } = {},
) {
  const api = useApi();
  return useQuery({
    queryKey: [EDITORIAL_KEY, ...key],
    queryFn: ({ signal }) => api.get<T>(path ?? "", signal),
    enabled: path !== null && options.enabled !== false,
    ...(options.fresh ? { staleTime: 0, gcTime: 0 } : {}),
  });
}

function useEditorialPages<T>(
  key: readonly unknown[],
  path: string,
  params: Params,
  enabled = true,
) {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: [EDITORIAL_KEY, ...key, params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.get<Page<T>>(withParams(path, { ...params, cursor: pageParam }), signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return { ...query, items };
}

/**
 * Runs a write, announces success, and refetches everything staff may be looking at.
 * Errors stay on `mutation.error` so each screen can show them next to the control.
 */
export function useEditorialMutation<TVariables, TData>(options: {
  mutationFn: (variables: TVariables, api: EditorialApi) => Promise<TData>;
  success?: MessageKey;
  onSuccess?: (data: TData, variables: TVariables) => void;
}): UseMutationResult<TData, Error, TVariables> {
  const api = useApi();
  const queryClient = useQueryClient();
  const notify = useNotify();
  return useMutation<TData, Error, TVariables>({
    mutationFn: (variables) => options.mutationFn(variables, api),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: [EDITORIAL_KEY] });
      if (options.success) {
        notify(options.success, "success");
      }
      options.onSuccess?.(data, variables);
    },
  });
}

/* Intake */

export interface SubmissionFilters {
  workflow_status?: string;
  channel?: string;
  assigned_to_id?: string;
}

export function useSubmissions(filters: SubmissionFilters, limit = 25, enabled = true) {
  return useEditorialPages<Submission>(
    ["submissions"],
    "/api/v1/editorial/submissions",
    { ...filters, limit },
    enabled,
  );
}

export function useSubmission(id: string) {
  return useEditorialQuery<SubmissionDetail>(
    ["submission", id],
    `/api/v1/editorial/submissions/${id}`,
  );
}

/** Never cached: the contact is fetched only on an explicit request and dropped when hidden. */
export function useSubmissionContact(id: string, revealed: boolean) {
  return useEditorialQuery<SubmissionContact | null>(
    ["submission", id, "contact"],
    `/api/v1/editorial/submissions/${id}/contact`,
    { enabled: revealed, fresh: true },
  );
}

export function useClaims(enabled = true) {
  return useEditorialPages<Claim>(["claims"], "/api/v1/editorial/claims", { limit: 50 }, enabled);
}

/* Staff */

export function useStaffDirectory(enabled = true) {
  return useEditorialQuery<{ items: StaffMember[] }>(["staff"], "/api/v1/editorial/staff", {
    enabled,
  });
}

export function useAdminUsers() {
  return useEditorialQuery<{ items: UserSummary[] }>(["admin-users"], "/api/v1/admin/users");
}

/* Investigations */

export interface InvestigationFilters {
  mine?: boolean;
  workflow_status?: string;
  claim_id?: string;
}

export function useInvestigations(filters: InvestigationFilters, limit = 25, enabled = true) {
  return useEditorialPages<InvestigationListItem>(
    ["investigations"],
    "/api/v1/investigations",
    { ...filters, limit },
    enabled,
  );
}

export function useInvestigation(id: string | null) {
  return useEditorialQuery<InvestigationDetail>(
    ["investigation", id],
    id ? `/api/v1/investigations/${id}` : null,
  );
}

/* Archive */

export function useArchiveDocuments(investigationId?: string, enabled = true) {
  return useEditorialPages<ArchiveDocument>(
    ["archive-documents"],
    "/api/v1/archive/documents",
    { investigation_id: investigationId, limit: 50 },
    enabled,
  );
}

export function useArchiveDocument(id: string) {
  return useEditorialQuery<ArchiveDocument>(
    ["archive-document", id],
    `/api/v1/archive/documents/${id}`,
  );
}

export function useArchiveGrants(id: string, enabled: boolean) {
  return useEditorialQuery<{ items: ArchiveGrant[] }>(
    ["archive-document", id, "grants"],
    `/api/v1/archive/documents/${id}/grants`,
    { enabled },
  );
}

export type { AccessLink };

/* Fact-checks */

export interface FactCheckFilters {
  workflow_status?: string;
  language?: string;
  mine?: boolean;
  awaiting_my_approval?: boolean;
}

export function useFactChecks(filters: FactCheckFilters, limit = 25, enabled = true) {
  return useEditorialPages<FactCheckListItem>(
    ["factchecks"],
    "/api/v1/editorial/factchecks",
    { ...filters, limit },
    enabled,
  );
}

export function useFactCheck(id: string) {
  return useEditorialQuery<FactCheckDetail>(
    ["factcheck", id],
    `/api/v1/editorial/factchecks/${id}`,
  );
}

const languagePath = (id: string, language: Locale) =>
  `/api/v1/editorial/factchecks/${id}/languages/${language}`;

export function useDraft(id: string, language: Locale) {
  return useEditorialQuery<Draft>(["factcheck", id, language, "draft"], languagePath(id, language));
}

export function useReadiness(id: string, language: Locale) {
  return useEditorialQuery<Readiness>(
    ["factcheck", id, language, "readiness"],
    `${languagePath(id, language)}/readiness`,
  );
}

export function useReviews(id: string, language: Locale) {
  return useEditorialQuery<{ items: Review[] }>(
    ["factcheck", id, language, "reviews"],
    `${languagePath(id, language)}/reviews`,
  );
}

export function useVersions(id: string, language: Locale) {
  return useEditorialQuery<{ items: VersionRow[] }>(
    ["factcheck", id, language, "versions"],
    `${languagePath(id, language)}/versions`,
  );
}

export function useVersion(id: string, language: Locale, versionNumber: number | null) {
  return useEditorialQuery<VersionDetail>(
    ["factcheck", id, language, "version", versionNumber],
    versionNumber === null ? null : `${languagePath(id, language)}/versions/${versionNumber}`,
  );
}

export function usePublishPreview(id: string, language: Locale, enabled: boolean) {
  return useEditorialQuery<PublishPreview>(
    ["factcheck", id, language, "publish-preview"],
    `${languagePath(id, language)}/publish-preview`,
    { enabled, fresh: true },
  );
}

export function useFactCheckTopics(id: string) {
  return useEditorialQuery<{ items: EditorialTopic[] }>(
    ["factcheck", id, "topics"],
    `/api/v1/editorial/factchecks/${id}/topics`,
  );
}

export function useApprovalQueue(enabled = true) {
  return useEditorialPages<QueueItem>(
    ["approval-queue"],
    "/api/v1/editorial/approval-queue",
    { limit: 50 },
    enabled,
  );
}

export function useAllTopics(enabled = true) {
  return useEditorialQuery<{ items: EditorialTopic[] }>(["topics"], "/api/v1/editorial/topics", {
    enabled,
  });
}

export function useAudit(subjectType: AuditSubject, subjectId: string, enabled: boolean) {
  return useEditorialPages<AuditEvent>(
    ["audit", subjectType, subjectId],
    "/api/v1/editorial/audit",
    { subject_type: subjectType, subject_id: subjectId, limit: 25 },
    enabled,
  );
}

export { languagePath };
