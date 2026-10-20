import { useState, type FormEvent } from "react";

import { useEditorialMutation } from "../../api/editorial/queries";
import {
  STANCES,
  type ArchiveDocument,
  type Evidence,
  type InvestigationDetail,
  type Stance,
} from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { SelectField, TextAreaField } from "../../components/Fields";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { moveId, useFieldError } from "../formErrors";
import { nullIfBlank } from "../text";
import { useUserNames } from "../useUserNames";

interface EvidenceFormValues {
  stance: Stance | "";
  excerpt: string;
  notes: string;
  sourceId: string;
  documentId: string;
}

function EvidenceForm({
  idPrefix,
  initial,
  sources,
  documents,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial?: Evidence;
  sources: InvestigationDetail["sources"];
  documents: ArchiveDocument[];
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: EvidenceFormValues) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<EvidenceFormValues>({
    stance: initial?.stance ?? "",
    excerpt: initial?.excerpt ?? "",
    notes: initial?.notes ?? "",
    sourceId: initial?.source_id ?? "",
    documentId: initial?.archive_document_id ?? "",
  });
  const fieldError = useFieldError(error);
  const set = (name: keyof EvidenceFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form className="stack form-wide" onSubmit={submit}>
      <SelectField
        id={`${idPrefix}-stance`}
        label={t("evidence.stance")}
        value={values.stance}
        onChange={(event) => set("stance")(event.target.value)}
        options={[
          { value: "", label: t("editorial.choose") },
          ...STANCES.map((stance) => ({ value: stance, label: t(`evidence.stance.${stance}`) })),
        ]}
      />
      <TextAreaField
        id={`${idPrefix}-excerpt`}
        label={t("evidence.excerpt")}
        rows={3}
        value={values.excerpt}
        error={fieldError("excerpt")}
        onChange={(event) => set("excerpt")(event.target.value)}
      />
      <SelectField
        id={`${idPrefix}-source`}
        label={t("evidence.source")}
        value={values.sourceId}
        onChange={(event) => set("sourceId")(event.target.value)}
        options={[
          { value: "", label: t("editorial.none") },
          ...sources.map((source) => ({ value: source.id, label: source.title })),
        ]}
      />
      <SelectField
        id={`${idPrefix}-document`}
        label={t("evidence.document")}
        value={values.documentId}
        onChange={(event) => set("documentId")(event.target.value)}
        options={[
          { value: "", label: t("editorial.none") },
          ...documents.map((document) => ({ value: document.id, label: document.title })),
        ]}
      />
      <fieldset className="internal-fieldset">
        <legend>{t("editorial.internal")}</legend>
        <TextAreaField
          id={`${idPrefix}-notes`}
          label={t("evidence.notes")}
          rows={3}
          value={values.notes}
          onChange={(event) => set("notes")(event.target.value)}
        />
      </fieldset>
      <EditorialError error={error} />
      <div className="button-row">
        <Button type="submit" disabled={pending}>
          {pending ? t("editorial.working") : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            {t("dialog.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function body(values: EvidenceFormValues) {
  return {
    stance: values.stance === "" ? null : values.stance,
    excerpt: nullIfBlank(values.excerpt),
    notes: nullIfBlank(values.notes),
    source_id: values.sourceId === "" ? null : values.sourceId,
    archive_document_id: values.documentId === "" ? null : values.documentId,
  };
}

export function EvidenceSection({
  detail,
  documents,
  canWrite,
}: {
  detail: InvestigationDetail;
  documents: ArchiveDocument[];
  canWrite: boolean;
}) {
  const { t, locale } = useI18n();
  const names = useUserNames();
  const id = detail.investigation.id;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Evidence | null>(null);

  const create = useEditorialMutation<EvidenceFormValues, Evidence>({
    success: "evidence.saved",
    mutationFn: (values, api) =>
      api.send<Evidence>("POST", `/api/v1/investigations/${id}/evidence`, body(values)),
    onSuccess: () => setAdding(false),
  });
  const update = useEditorialMutation<{ evidenceId: string; values: EvidenceFormValues }, Evidence>(
    {
      success: "evidence.saved",
      mutationFn: ({ evidenceId, values }, api) =>
        api.send<Evidence>(
          "PATCH",
          `/api/v1/investigations/${id}/evidence/${evidenceId}`,
          body(values),
        ),
      onSuccess: () => setEditing(null),
    },
  );
  const verify = useEditorialMutation<string, Evidence>({
    success: "evidence.verified",
    mutationFn: (evidenceId, api) =>
      api.send<Evidence>("POST", `/api/v1/investigations/${id}/evidence/${evidenceId}/verify`),
  });
  const remove = useEditorialMutation<string, InvestigationDetail>({
    success: "evidence.deleted",
    mutationFn: (evidenceId, api) =>
      api.send<InvestigationDetail>(
        "DELETE",
        `/api/v1/investigations/${id}/evidence/${evidenceId}`,
      ),
    onSuccess: () => setDeleting(null),
  });
  const reorder = useEditorialMutation<string[], InvestigationDetail>({
    mutationFn: (ids, api) =>
      api.send<InvestigationDetail>("POST", `/api/v1/investigations/${id}/evidence/reorder`, {
        ordered_ids: ids,
      }),
  });

  const ids = detail.evidence_items.map((item) => item.id);
  const sourceTitle = (sourceId: string | null) =>
    detail.sources.find((source) => source.id === sourceId)?.title;
  const documentTitle = (documentId: string | null) =>
    documents.find((document) => document.id === documentId)?.title;

  return (
    <section aria-labelledby="evidence-heading" className="stack">
      <h2 id="evidence-heading">{t("evidence.title")}</h2>
      {detail.evidence_items.length === 0 ? <p>{t("evidence.none")}</p> : null}
      <ol className="record-list">
        {detail.evidence_items.map((item, index) => (
          <li key={item.id} className="card">
            {editing === item.id ? (
              <EvidenceForm
                idPrefix={`evidence-${item.id}`}
                initial={item}
                sources={detail.sources}
                documents={documents}
                submitLabel={t("editorial.save")}
                pending={update.isPending}
                error={update.error}
                onSubmit={(values) => update.mutate({ evidenceId: item.id, values })}
                onCancel={() => {
                  update.reset();
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <p className="badge-row">
                  {item.stance ? (
                    <span className={`status-badge stance-${item.stance}`}>
                      {t(`evidence.stance.${item.stance}`)}
                    </span>
                  ) : (
                    <span className="status-badge">{t("evidence.noStance")}</span>
                  )}
                  {item.verified_at ? (
                    <span className="status-badge status-published">
                      {t("evidence.verifiedBy", {
                        name: names(item.verified_by_id),
                        date: formatDate(locale, item.verified_at),
                      })}
                    </span>
                  ) : (
                    <span className="status-badge status-draft">{t("evidence.unverified")}</span>
                  )}
                </p>
                {item.excerpt ? <blockquote className="preline">{item.excerpt}</blockquote> : null}
                <p className="card-meta">
                  {sourceTitle(item.source_id) ? (
                    <span>
                      {t("evidence.source")}: {sourceTitle(item.source_id)}
                    </span>
                  ) : null}
                  {documentTitle(item.archive_document_id) ? (
                    <span>
                      {t("evidence.document")}: {documentTitle(item.archive_document_id)}
                    </span>
                  ) : null}
                </p>
                {item.notes ? (
                  <div className="internal-note">
                    <p className="internal-label">{t("editorial.internal")}</p>
                    <p className="preline">{item.notes}</p>
                  </div>
                ) : null}
                {canWrite ? (
                  <div className="button-row">
                    {item.verified_at === null ? (
                      <Button
                        disabled={verify.isPending}
                        aria-label={t("evidence.verifyItem", { number: String(index + 1) })}
                        onClick={() => verify.mutate(item.id)}
                      >
                        {t("evidence.verify")}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      aria-label={t("editorial.moveUpItem", { item: String(index + 1) })}
                      disabled={reorder.isPending || index === 0}
                      onClick={() => {
                        const next = moveId(ids, item.id, -1);
                        if (next) reorder.mutate(next);
                      }}
                    >
                      {t("editorial.moveUp")}
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={t("editorial.moveDownItem", { item: String(index + 1) })}
                      disabled={reorder.isPending || index === ids.length - 1}
                      onClick={() => {
                        const next = moveId(ids, item.id, 1);
                        if (next) reorder.mutate(next);
                      }}
                    >
                      {t("editorial.moveDown")}
                    </Button>
                    <Button variant="secondary" onClick={() => setEditing(item.id)}>
                      {t("editorial.edit")}
                    </Button>
                    <Button variant="secondary" onClick={() => setDeleting(item)}>
                      {t("editorial.delete")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ol>
      <EditorialError error={verify.error ?? reorder.error} />
      {canWrite ? (
        adding ? (
          <>
            <h3>{t("evidence.add")}</h3>
            <EvidenceForm
              idPrefix="new-evidence"
              sources={detail.sources}
              documents={documents}
              submitLabel={t("evidence.add")}
              pending={create.isPending}
              error={create.error}
              onSubmit={(values) => create.mutate(values)}
              onCancel={() => {
                create.reset();
                setAdding(false);
              }}
            />
          </>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t("evidence.add")}
          </Button>
        )
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={t("evidence.delete")}
          consequence={t("evidence.deleteConsequence")}
          confirmLabel={t("editorial.delete")}
          pending={remove.isPending}
          error={<EditorialError error={remove.error} />}
          onCancel={() => {
            remove.reset();
            setDeleting(null);
          }}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      ) : null}
    </section>
  );
}
