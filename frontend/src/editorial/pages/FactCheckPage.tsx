import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  useAllTopics,
  useEditorialMutation,
  useFactCheck,
  useFactCheckTopics,
} from "../../api/editorial/queries";
import type { FactCheckDetail } from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { CheckboxField } from "../../components/Fields";
import { DocumentTitle } from "../../components/DocumentTitle";
import { TextField } from "../../components/TextField";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { AuditPanel } from "../components/AuditPanel";
import { EditorialError } from "../components/EditorialError";
import { ObjectHeader } from "../components/ObjectHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { LanguageStatusBadge, WorkflowBadge } from "../components/StatusBadge";
import { useFieldError } from "../formErrors";
import { can } from "../roles";

function SlugForm({ id, slug, locked }: { id: string; slug: string | null; locked: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState<string | null>(null);
  const current = value ?? slug ?? "";
  const save = useEditorialMutation<string, FactCheckDetail>({
    success: "factcheck.slug.saved",
    mutationFn: (next, api) =>
      api.send<FactCheckDetail>("PATCH", `/api/v1/editorial/factchecks/${id}`, {
        public_slug: next,
      }),
    onSuccess: () => setValue(null),
  });
  const fieldError = useFieldError(save.error);
  return (
    <form
      className="stack form-wide public-fieldset"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(current.trim());
      }}
    >
      <p className="public-label">{t("editorial.publicCopy")}</p>
      <TextField
        id="factcheck-slug"
        label={t("factcheck.slug")}
        hint={locked ? t("factcheck.slugLocked") : t("factcheck.slugHint")}
        value={current}
        disabled={locked}
        autoComplete="off"
        spellCheck={false}
        error={fieldError("public_slug")}
        onChange={(event) => setValue(event.target.value)}
      />
      <EditorialError error={save.error} />
      {locked ? null : (
        <div className="button-row">
          <Button
            type="submit"
            disabled={save.isPending || current.trim() === "" || current === slug}
          >
            {t("editorial.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

function TopicsSection({ id, canEdit }: { id: string; canEdit: boolean }) {
  const { t } = useI18n();
  const { locale } = useI18n();
  const assigned = useFactCheckTopics(id);
  const all = useAllTopics(canEdit);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const save = useEditorialMutation<string[], unknown>({
    success: "factcheck.topics.saved",
    mutationFn: (topicIds, api) =>
      api.send("PUT", `/api/v1/editorial/factchecks/${id}/topics`, { topic_ids: topicIds }),
    onSuccess: () => setSelection(null),
  });

  return (
    <section aria-labelledby="topics-heading" className="stack">
      <h2 id="topics-heading">{t("factcheck.topics.title")}</h2>
      <QueryBoundary query={assigned}>
        {(data) => {
          const current = selection ?? new Set(data.items.map((topic) => topic.id));
          const label = (topic: { name_bo: string; name_en: string }) =>
            locale === "bo" && topic.name_bo.trim() !== "" ? topic.name_bo : topic.name_en;
          if (!canEdit) {
            return data.items.length === 0 ? (
              <p>{t("factcheck.topics.none")}</p>
            ) : (
              <ul className="chip-list">
                {data.items.map((topic) => (
                  <li key={topic.id} className="chip">
                    {label(topic)}
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate([...current]);
              }}
            >
              <fieldset className="plain-fieldset">
                <legend>{t("factcheck.topics.choose")}</legend>
                {(all.data?.items ?? [])
                  .filter((topic) => topic.is_active || current.has(topic.id))
                  .map((topic) => (
                    <CheckboxField
                      key={topic.id}
                      id={`topic-${topic.id}`}
                      label={label(topic)}
                      checked={current.has(topic.id)}
                      onChange={(event) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(topic.id);
                        else next.delete(topic.id);
                        setSelection(next);
                      }}
                    />
                  ))}
              </fieldset>
              <EditorialError error={save.error ?? (all.isError ? all.error : null)} />
              <div className="button-row">
                <Button type="submit" disabled={selection === null || save.isPending}>
                  {t("editorial.save")}
                </Button>
              </div>
            </form>
          );
        }}
      </QueryBoundary>
    </section>
  );
}

export function FactCheckPage() {
  const { id = "" } = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const query = useFactCheck(id);

  return (
    <QueryBoundary query={query}>
      {(detail) => {
        const check = detail.fact_check;
        const anyPublished = detail.languages.some(
          (language) => language.live_version_number !== null,
        );
        return (
          <>
            <DocumentTitle title={check.public_slug ?? t("factcheck.untitled")} />
            <ObjectHeader
              eyebrow={t("nav.factChecks")}
              title={check.public_slug ?? t("factcheck.untitled")}
              badges={<WorkflowBadge status={check.workflow_status} />}
              nextAction={
                check.public_slug === null && can.editDraft(user)
                  ? t("factcheck.next.slug")
                  : t("factcheck.next.languages")
              }
            />
            {check.investigation_id ? (
              <p>
                <Link to={`/editorial/investigations/${check.investigation_id}`}>
                  {t("factcheck.openInvestigation")}
                </Link>
              </p>
            ) : null}

            <section aria-labelledby="languages-heading" className="stack">
              <h2 id="languages-heading">{t("factcheck.languages")}</h2>
              <ul className="card-list">
                {detail.languages.map((language) => (
                  <li key={language.language} className="card">
                    <h3 className="card-title">
                      <Link to={`/editorial/factchecks/${id}/${language.language}`}>
                        {t(`language.${language.language}`)}
                      </Link>
                    </h3>
                    <p className="badge-row">
                      <LanguageStatusBadge status={language.editorial_status} />
                      <span className="status-badge">
                        {t(`translation.${language.translation_status}`)}
                      </span>
                    </p>
                    <p className="card-meta">
                      <span>
                        {t("approvals.revision", {
                          revision: String(language.current_revision_number),
                        })}
                      </span>
                      {language.live_version_number !== null ? (
                        <span>
                          {t("factcheck.live", { number: String(language.live_version_number) })}
                        </span>
                      ) : null}
                      {language.published_at ? (
                        <span>{formatDate(locale, language.published_at)}</span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <SlugForm
              id={id}
              slug={check.public_slug}
              locked={anyPublished || !can.editDraft(user)}
            />
            <TopicsSection id={id} canEdit={can.manageTopics(user)} />
            <AuditPanel subjectType="fact_check" subjectId={id} />
          </>
        );
      }}
    </QueryBoundary>
  );
}
