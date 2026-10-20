import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { languagePath, useApi, useEditorialMutation } from "../../api/editorial/queries";
import {
  TRANSLATION_STATES,
  type Draft,
  type DraftPatch,
  type Preview,
  type Source,
  type TranslationState,
} from "../../api/editorial/types";
import { VERDICTS, type Verdict } from "../../api/public";
import { ApiError } from "../../api/types";
import { Button } from "../../components/Button";
import { SelectField, TextAreaField } from "../../components/Fields";
import { SanitizedHtml } from "../../components/SanitizedHtml";
import { TextField } from "../../components/TextField";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { useFieldError } from "../formErrors";
import { SourceRefs } from "./SourceRefs";

interface Values {
  title: string;
  summary: string;
  claim_text: string;
  context_text: string;
  verdict: Verdict | "";
  verdict_explanation: string;
  analysis_markdown: string;
  limitations_markdown: string;
  translation_status: TranslationState;
}

type Field = keyof Values;

const FIELDS: readonly Field[] = [
  "title",
  "summary",
  "claim_text",
  "context_text",
  "verdict",
  "verdict_explanation",
  "analysis_markdown",
  "limitations_markdown",
  "translation_status",
];

function valuesFrom(draft: Draft): Values {
  return {
    title: draft.title ?? "",
    summary: draft.summary ?? "",
    claim_text: draft.claim_text ?? "",
    context_text: draft.context_text ?? "",
    verdict: draft.verdict ?? "",
    verdict_explanation: draft.verdict_explanation ?? "",
    analysis_markdown: draft.analysis_markdown ?? "",
    limitations_markdown: draft.limitations_markdown ?? "",
    translation_status: draft.translation_status,
  };
}

function changedFields(a: Values, b: Values): Field[] {
  return FIELDS.filter((field) => a[field] !== b[field]);
}

/** Only the fields the editor changed are sent, so a conflict never rewrites someone else's work. */
function patchFor(base: Values, mine: Values, expected: number): DraftPatch {
  const patch: DraftPatch = { expected_revision: expected };
  for (const field of changedFields(base, mine)) {
    const value = mine[field];
    if (field === "translation_status") {
      patch.translation_status = mine.translation_status;
    } else if (field === "verdict") {
      patch.verdict = mine.verdict === "" ? null : mine.verdict;
    } else {
      patch[field] = value.trim() === "" ? null : value;
    }
  }
  return patch;
}

interface Conflict {
  latest: Draft;
  theirs: Field[];
  both: Field[];
}

export function DraftEditor({
  draft,
  editable,
  sources,
  onDirtyChange,
}: {
  draft: Draft;
  editable: boolean;
  sources: Source[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const api = useApi();
  const [base, setBase] = useState<Draft>(draft);
  const [values, setValues] = useState<Values>(() => valuesFrom(draft));
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const baseValues = valuesFrom(base);
  const mine = changedFields(baseValues, values);
  const dirty = mine.length > 0;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const path = languagePath(draft.fact_check_id, draft.language);
  const save = useEditorialMutation<{ patch: DraftPatch }, Draft>({
    success: "factcheck.draft.saved",
    mutationFn: ({ patch }, client) => client.send<Draft>("PATCH", path, patch),
    onSuccess: (saved) => {
      setBase(saved);
      setValues(valuesFrom(saved));
      setConflict(null);
      setPreview(null);
    },
  });
  const fieldError = useFieldError(save.error);

  const previewMutation = useMutation({
    mutationFn: () =>
      api.send<Preview>("POST", `${path}/preview`, {
        analysis_markdown: values.analysis_markdown,
        limitations_markdown: values.limitations_markdown,
      }),
    onSuccess: setPreview,
  });

  /** The patch is always built against the draft the editor started from, whatever revision is sent. */
  function trySave(expected: number) {
    save.mutate(
      { patch: patchFor(baseValues, values, expected) },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.serverCode === "stale_revision") {
            void api.get<Draft>(path).then((latest) => {
              const theirs = changedFields(baseValues, valuesFrom(latest));
              setConflict({ latest, theirs, both: theirs.filter((field) => mine.includes(field)) });
            });
          }
        },
      },
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (dirty) {
      trySave(base.current_revision_number);
    }
  }

  const set =
    <K extends Field>(name: K) =>
    (value: Values[K]) => {
      setValues((current) => ({ ...current, [name]: value }));
      setPreview(null);
    };

  const fieldLabel = (field: Field) => t(`factcheck.field.${field}`);
  const lang = draft.language;

  return (
    <form className="stack form-wide" onSubmit={submit} aria-labelledby="draft-heading">
      <h2 id="draft-heading">{t("factcheck.draft.title")}</h2>
      {conflict ? (
        <div className="alert alert-error" role="alert">
          <p>
            <strong>{t("factcheck.conflict.title")}</strong>{" "}
            {t("factcheck.conflict.body", {
              theirs: String(conflict.latest.current_revision_number),
              yours: String(base.current_revision_number),
            })}
          </p>
          {conflict.theirs.length > 0 ? (
            <p>
              {t("factcheck.conflict.theirFields", {
                fields: conflict.theirs.map(fieldLabel).join(", "),
              })}
            </p>
          ) : null}
          {conflict.both.length > 0 ? (
            <p>
              {t("factcheck.conflict.bothFields", {
                fields: conflict.both.map(fieldLabel).join(", "),
              })}
            </p>
          ) : null}
          <div className="button-row">
            <Button
              disabled={save.isPending}
              onClick={() => trySave(conflict.latest.current_revision_number)}
            >
              {t("factcheck.conflict.keepMine")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setBase(conflict.latest);
                setValues(valuesFrom(conflict.latest));
                setConflict(null);
                save.reset();
              }}
            >
              {t("factcheck.conflict.useTheirs")}
            </Button>
          </div>
        </div>
      ) : null}

      <fieldset className="public-fieldset" disabled={!editable}>
        <legend>{t("editorial.publicCopy")}</legend>
        <TextField
          id="draft-title"
          label={fieldLabel("title")}
          lang={lang}
          value={values.title}
          error={fieldError("title")}
          onChange={(event) => set("title")(event.target.value)}
        />
        <TextAreaField
          id="draft-summary"
          label={fieldLabel("summary")}
          lang={lang}
          rows={3}
          value={values.summary}
          error={fieldError("summary")}
          onChange={(event) => set("summary")(event.target.value)}
        />
        <SelectField
          id="draft-verdict"
          label={fieldLabel("verdict")}
          value={values.verdict}
          onChange={(event) => set("verdict")(event.target.value as Verdict | "")}
          options={[
            { value: "", label: t("editorial.choose") },
            ...VERDICTS.map((verdict) => ({ value: verdict, label: t(`verdict.${verdict}`) })),
          ]}
        />
        <TextAreaField
          id="draft-verdict-explanation"
          label={fieldLabel("verdict_explanation")}
          lang={lang}
          rows={4}
          value={values.verdict_explanation}
          onChange={(event) => set("verdict_explanation")(event.target.value)}
        />
        <TextAreaField
          id="draft-claim"
          label={fieldLabel("claim_text")}
          lang={lang}
          rows={3}
          value={values.claim_text}
          onChange={(event) => set("claim_text")(event.target.value)}
        />
        <TextAreaField
          id="draft-context"
          label={fieldLabel("context_text")}
          lang={lang}
          rows={4}
          value={values.context_text}
          onChange={(event) => set("context_text")(event.target.value)}
        />
        <TextAreaField
          id="draft-analysis"
          label={fieldLabel("analysis_markdown")}
          hint={t("factcheck.markdownHint")}
          lang={lang}
          rows={12}
          value={values.analysis_markdown}
          onChange={(event) => set("analysis_markdown")(event.target.value)}
        />
        <TextAreaField
          id="draft-limitations"
          label={fieldLabel("limitations_markdown")}
          hint={t("factcheck.markdownHint")}
          lang={lang}
          rows={5}
          value={values.limitations_markdown}
          onChange={(event) => set("limitations_markdown")(event.target.value)}
        />
        <SelectField
          id="draft-translation"
          label={fieldLabel("translation_status")}
          value={values.translation_status}
          onChange={(event) => set("translation_status")(event.target.value as TranslationState)}
          options={TRANSLATION_STATES.map((state) => ({
            value: state,
            label: t(`translation.${state}`),
          }))}
        />
      </fieldset>

      <div className="button-row">
        <Button
          variant="secondary"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          {t("factcheck.preview.button")}
        </Button>
        {editable ? (
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? t("editorial.working") : t("factcheck.draft.save")}
          </Button>
        ) : null}
      </div>
      {editable && dirty ? <p className="hint">{t("factcheck.draft.unsaved")}</p> : null}
      {!editable ? <p className="hint">{t("factcheck.draft.locked")}</p> : null}
      {conflict ? null : <EditorialError error={save.error} />}
      <EditorialError error={previewMutation.error} />
      {preview ? (
        <section aria-labelledby="preview-heading" className="stack preview-panel">
          <h3 id="preview-heading">{t("factcheck.preview.title")}</h3>
          <p className="hint">{t("factcheck.preview.note")}</p>
          <h4>{t("article.analysis")}</h4>
          <SanitizedHtml html={preview.analysis_html} lang={lang} />
          {preview.limitations_html.trim() !== "" ? (
            <>
              <h4>{t("article.limitations")}</h4>
              <SanitizedHtml html={preview.limitations_html} lang={lang} />
            </>
          ) : null}
        </section>
      ) : null}

      <SourceRefs
        draft={base}
        sources={sources}
        editable={editable}
        onSaved={(saved) =>
          // Only the revision moves on; text the editor is still typing keeps its saved baseline.
          setBase((current) => ({
            ...current,
            current_revision_number: saved.current_revision_number,
            sources: saved.sources,
          }))
        }
      />
    </form>
  );
}
