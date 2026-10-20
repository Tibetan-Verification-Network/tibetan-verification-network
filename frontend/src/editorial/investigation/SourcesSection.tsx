import { useState, type FormEvent } from "react";

import { useEditorialMutation } from "../../api/editorial/queries";
import type { InvestigationDetail, Source } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { TextAreaField } from "../../components/Fields";
import { TextField } from "../../components/TextField";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { dateInputValue, isoFromDateInput, moveId, useFieldError } from "../formErrors";
import { nullIfBlank, safeHttpUrl } from "../text";

interface SourceFormValues {
  title: string;
  url: string;
  publisher: string;
  author: string;
  language: string;
  publishedAt: string;
  reliability: string;
}

function valuesFrom(source?: Source): SourceFormValues {
  return {
    title: source?.title ?? "",
    url: source?.url ?? "",
    publisher: source?.publisher ?? "",
    author: source?.author ?? "",
    language: source?.source_language ?? "",
    publishedAt: dateInputValue(source?.published_at),
    reliability: source?.reliability_notes ?? "",
  };
}

function SourceForm({
  idPrefix,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial?: Source;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: SourceFormValues) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<SourceFormValues>(() => valuesFrom(initial));
  const fieldError = useFieldError(error);
  const set = (name: keyof SourceFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form className="stack form-wide" onSubmit={submit}>
      <fieldset className="public-fieldset">
        <legend>{t("editorial.publicCopy")}</legend>
        <TextField
          id={`${idPrefix}-title`}
          label={t("source.title")}
          required
          value={values.title}
          error={fieldError("title")}
          onChange={(event) => set("title")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-url`}
          label={t("source.url")}
          hint={t("source.urlHint")}
          value={values.url}
          error={fieldError("url")}
          onChange={(event) => set("url")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-publisher`}
          label={t("source.publisher")}
          value={values.publisher}
          onChange={(event) => set("publisher")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-author`}
          label={t("source.author")}
          value={values.author}
          onChange={(event) => set("author")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-language`}
          label={t("source.language")}
          value={values.language}
          onChange={(event) => set("language")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-published`}
          label={t("source.publishedAt")}
          type="date"
          value={values.publishedAt}
          onChange={(event) => set("publishedAt")(event.target.value)}
        />
      </fieldset>
      <fieldset className="internal-fieldset">
        <legend>{t("editorial.internal")}</legend>
        <TextAreaField
          id={`${idPrefix}-reliability`}
          label={t("source.reliability")}
          hint={t("source.reliabilityHint")}
          rows={3}
          value={values.reliability}
          onChange={(event) => set("reliability")(event.target.value)}
        />
      </fieldset>
      <EditorialError error={error} />
      <div className="button-row">
        <Button type="submit" disabled={pending || values.title.trim() === ""}>
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

function body(values: SourceFormValues) {
  return {
    title: values.title.trim(),
    url: nullIfBlank(values.url),
    publisher: nullIfBlank(values.publisher),
    author: nullIfBlank(values.author),
    source_language: nullIfBlank(values.language),
    published_at: isoFromDateInput(values.publishedAt),
    reliability_notes: nullIfBlank(values.reliability),
  };
}

export function SourcesSection({
  detail,
  canWrite,
}: {
  detail: InvestigationDetail;
  canWrite: boolean;
}) {
  const { t } = useI18n();
  const id = detail.investigation.id;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Source | null>(null);

  const create = useEditorialMutation<SourceFormValues, Source>({
    success: "source.saved",
    mutationFn: (values, api) =>
      api.send<Source>("POST", `/api/v1/investigations/${id}/sources`, body(values)),
    onSuccess: () => setAdding(false),
  });
  const update = useEditorialMutation<{ sourceId: string; values: SourceFormValues }, Source>({
    success: "source.saved",
    mutationFn: ({ sourceId, values }, api) =>
      api.send<Source>("PATCH", `/api/v1/investigations/${id}/sources/${sourceId}`, body(values)),
    onSuccess: () => setEditing(null),
  });
  const remove = useEditorialMutation<string, InvestigationDetail>({
    success: "source.deleted",
    mutationFn: (sourceId, api) =>
      api.send<InvestigationDetail>("DELETE", `/api/v1/investigations/${id}/sources/${sourceId}`),
    onSuccess: () => setDeleting(null),
  });
  const reorder = useEditorialMutation<string[], InvestigationDetail>({
    mutationFn: (ids, api) =>
      api.send<InvestigationDetail>("POST", `/api/v1/investigations/${id}/sources/reorder`, {
        ordered_ids: ids,
      }),
  });

  const ids = detail.sources.map((source) => source.id);

  return (
    <section aria-labelledby="sources-heading" className="stack">
      <h2 id="sources-heading">{t("source.title.plural")}</h2>
      {detail.sources.length === 0 ? <p>{t("source.none")}</p> : null}
      <ol className="record-list">
        {detail.sources.map((source) => {
          const link = safeHttpUrl(source.url);
          return (
            <li key={source.id} className="card">
              {editing === source.id ? (
                <SourceForm
                  idPrefix={`source-${source.id}`}
                  initial={source}
                  submitLabel={t("editorial.save")}
                  pending={update.isPending}
                  error={update.error}
                  onSubmit={(values) => update.mutate({ sourceId: source.id, values })}
                  onCancel={() => {
                    update.reset();
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <h3 className="card-title">{source.title}</h3>
                  <p className="card-meta">
                    {source.publisher ? <span>{source.publisher}</span> : null}
                    {source.author ? <span>{source.author}</span> : null}
                    {link ? (
                      <a href={link} rel="noopener noreferrer nofollow" target="_blank">
                        {link}
                      </a>
                    ) : source.url ? (
                      <span>{source.url}</span>
                    ) : null}
                  </p>
                  {source.reliability_notes ? (
                    <div className="internal-note">
                      <p className="internal-label">{t("editorial.internal")}</p>
                      <p className="preline">{source.reliability_notes}</p>
                    </div>
                  ) : null}
                  {canWrite ? (
                    <div className="button-row">
                      <Button
                        variant="secondary"
                        aria-label={t("editorial.moveUpItem", { item: source.title })}
                        disabled={reorder.isPending || ids.indexOf(source.id) === 0}
                        onClick={() => {
                          const next = moveId(ids, source.id, -1);
                          if (next) reorder.mutate(next);
                        }}
                      >
                        {t("editorial.moveUp")}
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label={t("editorial.moveDownItem", { item: source.title })}
                        disabled={reorder.isPending || ids.indexOf(source.id) === ids.length - 1}
                        onClick={() => {
                          const next = moveId(ids, source.id, 1);
                          if (next) reorder.mutate(next);
                        }}
                      >
                        {t("editorial.moveDown")}
                      </Button>
                      <Button variant="secondary" onClick={() => setEditing(source.id)}>
                        {t("editorial.edit")}
                      </Button>
                      <Button variant="secondary" onClick={() => setDeleting(source)}>
                        {t("editorial.delete")}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <EditorialError error={reorder.error} />
      {canWrite ? (
        adding ? (
          <>
            <h3>{t("source.add")}</h3>
            <SourceForm
              idPrefix="new-source"
              submitLabel={t("source.add")}
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
            {t("source.add")}
          </Button>
        )
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={t("source.delete")}
          consequence={t("source.deleteConsequence", { title: deleting.title })}
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
