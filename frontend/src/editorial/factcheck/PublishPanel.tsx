import { useState } from "react";

import { languagePath, useEditorialMutation, usePublishPreview } from "../../api/editorial/queries";
import type { Draft, LanguageStatus } from "../../api/editorial/types";
import type { VersionKind } from "../../api/public";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { SelectField, TextAreaField } from "../../components/Fields";
import { LoadingState } from "../../components/LoadingState";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { readinessLabel } from "../components/readiness";
import { can } from "../roles";
import { SnapshotPreview } from "./SnapshotPreview";

type Dialog = "approve" | "publish" | "correct" | "withdraw" | null;
type CorrectionKind = Extract<VersionKind, "correction" | "update" | "clarification">;

function PublishDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { t } = useI18n();
  const id = draft.fact_check_id;
  const preview = usePublishPreview(id, draft.language, true);
  const [note, setNote] = useState("");
  const publish = useEditorialMutation<string | null, unknown>({
    success: "publish.done",
    mutationFn: (correction, api) =>
      api.send("POST", `${languagePath(id, draft.language)}/publish`, {
        correction_note: correction,
      }),
    onSuccess: onClose,
  });
  const data = preview.data;
  const blocked = data === undefined || data.readiness_issues.length > 0;
  const noteMissing = data?.correction_note_required === true && note.trim() === "";

  return (
    <ConfirmDialog
      wide
      title={t("publish.title")}
      consequence={t("publish.consequence", { revision: String(draft.current_revision_number) })}
      confirmLabel={t("publish.confirm")}
      typedConfirmation={data?.snapshot.public_slug ?? "…"}
      confirmDisabled={blocked || noteMissing || data?.snapshot.public_slug === undefined}
      pending={publish.isPending}
      error={<EditorialError error={publish.error ?? (preview.isError ? preview.error : null)} />}
      onCancel={onClose}
      onConfirm={() =>
        publish.mutate(data?.correction_note_required ? note.trim() : note.trim() || null)
      }
    >
      {preview.isPending ? (
        <LoadingState />
      ) : data ? (
        <>
          <p>
            <strong>{t(`article.kind.${data.kind}`)}</strong> ·{" "}
            {t("publish.revision", { revision: String(data.revision_number) })}
          </p>
          {data.readiness_issues.length > 0 ? (
            <div className="alert alert-error" role="alert">
              <p>{t("publish.blocked")}</p>
              <ul>
                {data.readiness_issues.map((issue) => (
                  <li key={issue}>{readinessLabel(t, issue)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.correction_note_required ? (
            <TextAreaField
              id="publish-correction-note"
              label={t("publish.correctionNote")}
              hint={t("publish.correctionNoteHint")}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          ) : null}
          <h3>{t("publish.previewTitle")}</h3>
          <p className="hint">{t("publish.previewNote")}</p>
          <div className="preview-scroll">
            <SnapshotPreview snapshot={data.snapshot} />
          </div>
        </>
      ) : null}
    </ConfirmDialog>
  );
}

/** Approval, publication, corrections and withdrawal. Only approvers see these controls. */
export function PublishPanel({
  draft,
  status,
  slug,
}: {
  draft: Draft;
  status: LanguageStatus;
  slug: string | null;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const path = languagePath(draft.fact_check_id, draft.language);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [kind, setKind] = useState<CorrectionKind>("correction");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");

  const close = () => {
    setDialog(null);
    setReason("");
    setNotice("");
  };

  const approve = useEditorialMutation<void, Draft>({
    success: "approve.done",
    mutationFn: (_, api) =>
      api.send<Draft>("POST", `${path}/approve`, {
        expected_revision: draft.current_revision_number,
      }),
    onSuccess: close,
  });
  const correct = useEditorialMutation<void, Draft>({
    success: "correction.started",
    mutationFn: (_, api) =>
      api.send<Draft>("POST", `${path}/corrections`, { kind, reason: reason.trim() }),
    onSuccess: close,
  });
  const withdraw = useEditorialMutation<void, Draft>({
    success: "withdraw.done",
    mutationFn: (_, api) =>
      api.send<Draft>("POST", `${path}/withdraw`, {
        public_notice: notice.trim(),
        internal_reason: reason.trim(),
      }),
    onSuccess: close,
  });

  if (!can.decide(user)) {
    return null;
  }

  return (
    <section aria-labelledby="publish-heading" className="stack">
      <h2 id="publish-heading">{t("publish.panel")}</h2>
      {status === "ready_for_approval" ? (
        <>
          <p>{t("approve.lead", { revision: String(draft.current_revision_number) })}</p>
          <div className="button-row">
            <Button onClick={() => setDialog("approve")}>
              {t("approve.button", { revision: String(draft.current_revision_number) })}
            </Button>
          </div>
        </>
      ) : null}
      {status === "approved" ? (
        <>
          <p>{t("publish.lead", { revision: String(draft.current_revision_number) })}</p>
          <div className="button-row">
            <Button onClick={() => setDialog("publish")}>{t("publish.button")}</Button>
          </div>
        </>
      ) : null}
      {status === "published" ? (
        <>
          <p>{t("correction.lead")}</p>
          <div className="button-row">
            <Button variant="secondary" onClick={() => setDialog("correct")}>
              {t("correction.button")}
            </Button>
            <Button variant="secondary" onClick={() => setDialog("withdraw")}>
              {t("withdraw.button")}
            </Button>
          </div>
        </>
      ) : null}
      {status !== "ready_for_approval" && status !== "approved" && status !== "published" ? (
        <p>{t("publish.notReady")}</p>
      ) : null}

      {dialog === "approve" ? (
        <ConfirmDialog
          title={t("approve.title")}
          consequence={t("approve.consequence", {
            revision: String(draft.current_revision_number),
            title: draft.title ?? t("factcheck.untitled"),
          })}
          confirmLabel={t("approve.button", { revision: String(draft.current_revision_number) })}
          pending={approve.isPending}
          error={<EditorialError error={approve.error} />}
          onCancel={() => {
            approve.reset();
            close();
          }}
          onConfirm={() => approve.mutate()}
        />
      ) : null}
      {dialog === "publish" ? <PublishDialog draft={draft} onClose={close} /> : null}
      {dialog === "correct" ? (
        <ConfirmDialog
          title={t("correction.title")}
          consequence={t("correction.consequence")}
          confirmLabel={t("correction.button")}
          confirmDisabled={reason.trim() === ""}
          pending={correct.isPending}
          error={<EditorialError error={correct.error} />}
          onCancel={() => {
            correct.reset();
            close();
          }}
          onConfirm={() => correct.mutate()}
        >
          <SelectField
            id="correction-kind"
            label={t("correction.kind")}
            value={kind}
            onChange={(event) => setKind(event.target.value as CorrectionKind)}
            options={(["correction", "update", "clarification"] as const).map((value) => ({
              value,
              label: t(`article.kind.${value}`),
            }))}
          />
          <TextAreaField
            id="correction-reason"
            label={t("correction.reason")}
            hint={t("correction.reasonHint")}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmDialog>
      ) : null}
      {dialog === "withdraw" ? (
        <ConfirmDialog
          title={t("withdraw.title")}
          consequence={t("withdraw.consequence")}
          confirmLabel={t("withdraw.confirm")}
          typedConfirmation={slug ?? draft.fact_check_id}
          confirmDisabled={reason.trim() === "" || notice.trim() === ""}
          pending={withdraw.isPending}
          error={<EditorialError error={withdraw.error} />}
          onCancel={() => {
            withdraw.reset();
            close();
          }}
          onConfirm={() => withdraw.mutate()}
        >
          <TextAreaField
            id="withdraw-notice"
            label={t("withdraw.notice")}
            hint={t("withdraw.noticeHint")}
            rows={3}
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
          />
          <TextAreaField
            id="withdraw-reason"
            label={t("withdraw.internalReason")}
            hint={t("withdraw.internalReasonHint")}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
