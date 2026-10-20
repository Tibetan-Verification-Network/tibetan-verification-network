import { useQueryClient } from "@tanstack/react-query";

import { EDITORIAL_KEY } from "../../api/editorial/queries";
import { ApiError } from "../../api/types";
import { Button } from "../../components/Button";
import type { MessageKey } from "../../i18n/locales/en";
import { useI18n } from "../../i18n/useI18n";
import { readinessLabel } from "./readiness";

const CONFLICT_CODES: Readonly<Record<string, MessageKey>> = {
  stale_revision: "editorial.conflict.stale_revision",
  draft_locked: "editorial.conflict.draft_locked",
  readiness_failed: "editorial.conflict.readiness_failed",
  not_approved: "editorial.conflict.not_approved",
  correction_note_required: "editorial.conflict.correction_note_required",
  invalid_transition: "editorial.conflict.invalid_transition",
  slug_immutable: "editorial.conflict.slug_immutable",
  slug_taken: "editorial.conflict.slug_taken",
  slug_conflict: "editorial.conflict.slug_conflict",
  is_author: "editorial.conflict.is_author",
  is_ready_marking_editor: "editorial.conflict.is_ready_marking_editor",
  not_approving_reviewer: "editorial.conflict.not_approving_reviewer",
  investigation_frozen: "editorial.conflict.investigation_frozen",
};

/**
 * One place that turns an API failure into text for staff:
 * 404 is "not found or no access", 409 is a conflict with a reload option, 422 points at fields.
 */
export function EditorialError({ error }: { error: unknown }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  if (error === null || error === undefined) {
    return null;
  }
  const api = error instanceof ApiError ? error : null;
  const status = api?.status ?? 0;

  let message: string;
  if (status === 404) {
    message = t("editorial.error.notFound");
  } else if (status === 409) {
    const key = api?.serverCode ? CONFLICT_CODES[api.serverCode] : undefined;
    message = t(key ?? "editorial.error.conflict");
  } else if (status === 422 || status === 400) {
    message = t("editorial.error.validation");
  } else if (api?.code === "errors.csrf") {
    message = t("errors.csrf");
  } else if (status === 403) {
    message = t("errors.forbidden");
  } else if (status === 401) {
    message = t("errors.authRequired");
  } else if (status === 0) {
    message = t("errors.network");
  } else {
    message = t("errors.generic");
  }

  const detail = api?.serverMessage;
  const issues = api?.issues ?? [];

  return (
    <div className="alert alert-error editorial-error" role="alert">
      <p>{message}</p>
      {issues.length > 0 ? (
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{readinessLabel(t, issue)}</li>
          ))}
        </ul>
      ) : null}
      {detail ? (
        <p className="hint" lang="en">
          {detail}
        </p>
      ) : null}
      {status === 409 ? (
        <Button
          variant="secondary"
          onClick={() => void queryClient.invalidateQueries({ queryKey: [EDITORIAL_KEY] })}
        >
          {t("editorial.reload")}
        </Button>
      ) : null}
    </div>
  );
}
