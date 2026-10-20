import { useState } from "react";

import { languagePath, useEditorialMutation, useReviews } from "../../api/editorial/queries";
import type { Draft, LanguageStatus, Review } from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { TextAreaField } from "../../components/Fields";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { InternalPanel } from "../components/InternalPanel";
import { can } from "../roles";
import { useUserNames } from "../useUserNames";

type Reasoned = "request_changes" | "reopen";

function Thread({ reviews }: { reviews: Review[] }) {
  const { t, locale } = useI18n();
  const names = useUserNames();
  if (reviews.length === 0) {
    return <p>{t("review.none")}</p>;
  }
  return (
    <ol className="record-list">
      {reviews.map((review) => (
        <li key={review.id} className="card">
          <p className="badge-row">
            <span className="status-badge">{t(`review.decision.${review.decision}`)}</span>
            {review.invalidated_at ? (
              <span className="status-badge status-draft">{t("review.superseded")}</span>
            ) : null}
          </p>
          {review.comments ? <p className="preline">{review.comments}</p> : null}
          <p className="hint">
            {names(review.reviewer_id)} ·{" "}
            <time dateTime={review.created_at}>{formatDate(locale, review.created_at)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * The review thread and the workflow actions around it. Reviewer comments are internal and
 * are never part of what gets published.
 */
export function ReviewPanel({
  draft,
  status,
  dirty,
}: {
  draft: Draft;
  status: LanguageStatus;
  dirty: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const id = draft.fact_check_id;
  const language = draft.language;
  const path = languagePath(id, language);
  const reviews = useReviews(id, language);
  const [comment, setComment] = useState("");
  const [reasoned, setReasoned] = useState<Reasoned | null>(null);
  const [reason, setReason] = useState("");
  const [confirmReady, setConfirmReady] = useState(false);

  const addComment = useEditorialMutation<string, Review>({
    success: "review.commented",
    mutationFn: (comments, api) => api.send<Review>("POST", `${path}/reviews`, { comments }),
    onSuccess: () => setComment(""),
  });
  const submit = useEditorialMutation<void, unknown>({
    success: "review.submitted",
    mutationFn: (_, api) => api.send("POST", `${path}/submit-for-review`),
  });
  const markReady = useEditorialMutation<void, Draft>({
    success: "review.markedReady",
    mutationFn: (_, api) => api.send<Draft>("POST", `${path}/mark-ready`),
    onSuccess: () => setConfirmReady(false),
  });
  const reasonAction = useEditorialMutation<{ action: Reasoned; reason: string }, Draft>({
    mutationFn: ({ action, reason: text }, api) =>
      api.send<Draft>("POST", `${path}/${action === "reopen" ? "reopen" : "request-changes"}`, {
        reason: text,
      }),
    success: "review.updated",
    onSuccess: () => {
      setReasoned(null);
      setReason("");
    },
  });

  const closed = status === "published" || status === "withdrawn";
  const canSubmit = can.editDraft(user) && status === "draft";
  const canReopen =
    can.editDraft(user) &&
    (status === "in_review" ||
      status === "ready_for_approval" ||
      status === "approved" ||
      status === "changes_requested");
  const canMarkReady = can.review(user) && status === "in_review";
  const canRequest =
    can.requestChanges(user) && (status === "in_review" || status === "ready_for_approval");

  return (
    <InternalPanel title={t("review.title")}>
      <p>{t("review.lead")}</p>
      {reviews.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : reviews.isError ? (
        <EditorialError error={reviews.error} />
      ) : (
        <Thread reviews={reviews.data.items} />
      )}

      {can.review(user) && !closed ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (comment.trim() !== "") {
              addComment.mutate(comment.trim());
            }
          }}
        >
          <TextAreaField
            id="review-comment"
            label={t("review.commentLabel")}
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <EditorialError error={addComment.error} />
          <div className="button-row">
            <Button type="submit" disabled={comment.trim() === "" || addComment.isPending}>
              {t("review.addComment")}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="button-row">
        {canSubmit ? (
          <Button disabled={dirty || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? t("editorial.working") : t("review.submit")}
          </Button>
        ) : null}
        {canMarkReady ? (
          <Button onClick={() => setConfirmReady(true)}>{t("review.markReady")}</Button>
        ) : null}
        {canRequest ? (
          <Button variant="secondary" onClick={() => setReasoned("request_changes")}>
            {t("review.requestChanges")}
          </Button>
        ) : null}
        {canReopen ? (
          <Button variant="secondary" onClick={() => setReasoned("reopen")}>
            {t("review.reopen")}
          </Button>
        ) : null}
      </div>
      {canSubmit && dirty ? <p className="hint">{t("review.saveFirst")}</p> : null}
      <EditorialError error={submit.error} />

      {confirmReady ? (
        <ConfirmDialog
          title={t("review.markReady")}
          consequence={t("review.markReadyConsequence", {
            revision: String(draft.current_revision_number),
          })}
          confirmLabel={t("review.markReady")}
          pending={markReady.isPending}
          error={<EditorialError error={markReady.error} />}
          onCancel={() => {
            markReady.reset();
            setConfirmReady(false);
          }}
          onConfirm={() => markReady.mutate()}
        />
      ) : null}
      {reasoned !== null ? (
        <ConfirmDialog
          title={reasoned === "reopen" ? t("review.reopen") : t("review.requestChanges")}
          consequence={
            reasoned === "reopen"
              ? t("review.reopenConsequence")
              : t("review.requestChangesConsequence")
          }
          confirmLabel={reasoned === "reopen" ? t("review.reopen") : t("review.requestChanges")}
          confirmDisabled={reason.trim() === ""}
          pending={reasonAction.isPending}
          error={<EditorialError error={reasonAction.error} />}
          onCancel={() => {
            reasonAction.reset();
            setReasoned(null);
            setReason("");
          }}
          onConfirm={() => reasonAction.mutate({ action: reasoned, reason: reason.trim() })}
        >
          <TextAreaField
            id="review-reason"
            label={t("editorial.reason")}
            hint={t("editorial.reasonHint")}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmDialog>
      ) : null}
    </InternalPanel>
  );
}
