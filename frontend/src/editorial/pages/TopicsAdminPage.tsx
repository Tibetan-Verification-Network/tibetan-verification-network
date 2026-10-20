import { useState, type FormEvent } from "react";

import { useAllTopics, useEditorialMutation } from "../../api/editorial/queries";
import type { EditorialTopic, TopicInput } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { CheckboxField, TextAreaField } from "../../components/Fields";
import { DocumentTitle } from "../../components/DocumentTitle";
import { TextField } from "../../components/TextField";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { QueryBoundary } from "../components/QueryBoundary";
import { useFieldError } from "../formErrors";
import { nullIfBlank } from "../text";

interface Values {
  slug: string;
  name_bo: string;
  name_en: string;
  description_bo: string;
  description_en: string;
  position: string;
  is_active: boolean;
}

function valuesFrom(topic?: EditorialTopic): Values {
  return {
    slug: topic?.slug ?? "",
    name_bo: topic?.name_bo ?? "",
    name_en: topic?.name_en ?? "",
    description_bo: topic?.description_bo ?? "",
    description_en: topic?.description_en ?? "",
    position: String(topic?.position ?? 0),
    is_active: topic?.is_active ?? true,
  };
}

function TopicForm({
  idPrefix,
  topic,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  topic?: EditorialTopic;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: Values) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Values>(() => valuesFrom(topic));
  const fieldError = useFieldError(error);
  const set = (name: keyof Values) => (value: string | boolean) =>
    setValues((current) => ({ ...current, [name]: value }));
  const lockedSlug = topic?.slug_immutable === true;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form className="stack form-wide" onSubmit={submit}>
      <fieldset className="public-fieldset">
        <legend>{t("editorial.publicCopy")}</legend>
        <TextField
          id={`${idPrefix}-slug`}
          label={t("topics.slug")}
          hint={lockedSlug ? t("topics.slugLocked") : t("factcheck.slugHint")}
          value={values.slug}
          disabled={lockedSlug}
          autoComplete="off"
          spellCheck={false}
          error={fieldError("slug")}
          onChange={(event) => set("slug")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-name-en`}
          label={t("topics.nameEn")}
          lang="en"
          value={values.name_en}
          error={fieldError("name_en")}
          onChange={(event) => set("name_en")(event.target.value)}
        />
        <TextField
          id={`${idPrefix}-name-bo`}
          label={t("topics.nameBo")}
          lang="bo"
          value={values.name_bo}
          error={fieldError("name_bo")}
          onChange={(event) => set("name_bo")(event.target.value)}
        />
        <TextAreaField
          id={`${idPrefix}-desc-en`}
          label={t("topics.descriptionEn")}
          lang="en"
          rows={2}
          value={values.description_en}
          onChange={(event) => set("description_en")(event.target.value)}
        />
        <TextAreaField
          id={`${idPrefix}-desc-bo`}
          label={t("topics.descriptionBo")}
          lang="bo"
          rows={2}
          value={values.description_bo}
          onChange={(event) => set("description_bo")(event.target.value)}
        />
      </fieldset>
      <TextField
        id={`${idPrefix}-position`}
        label={t("topics.position")}
        type="number"
        min={0}
        value={values.position}
        onChange={(event) => set("position")(event.target.value)}
      />
      <CheckboxField
        id={`${idPrefix}-active`}
        label={t("topics.active")}
        checked={values.is_active}
        onChange={(event) => set("is_active")(event.target.checked)}
      />
      <EditorialError error={error} />
      <div className="button-row">
        <Button
          type="submit"
          disabled={
            pending ||
            values.slug.trim() === "" ||
            values.name_en.trim() === "" ||
            values.name_bo.trim() === ""
          }
        >
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

function body(values: Values, locked: boolean): Partial<TopicInput> {
  const position = Number.parseInt(values.position, 10);
  return {
    ...(locked ? {} : { slug: values.slug.trim() }),
    name_en: values.name_en.trim(),
    name_bo: values.name_bo.trim(),
    description_en: nullIfBlank(values.description_en),
    description_bo: nullIfBlank(values.description_bo),
    position: Number.isNaN(position) ? 0 : position,
    is_active: values.is_active,
  };
}

export function TopicsAdminPage() {
  const { t, locale } = useI18n();
  const topics = useAllTopics();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const create = useEditorialMutation<Values, EditorialTopic>({
    success: "topics.saved",
    mutationFn: (values, api) =>
      api.send<EditorialTopic>("POST", "/api/v1/editorial/topics", body(values, false)),
    onSuccess: () => setAdding(false),
  });
  const update = useEditorialMutation<{ topic: EditorialTopic; values: Values }, EditorialTopic>({
    success: "topics.saved",
    mutationFn: ({ topic, values }, api) =>
      api.send<EditorialTopic>(
        "PATCH",
        `/api/v1/editorial/topics/${topic.id}`,
        body(values, topic.slug_immutable),
      ),
    onSuccess: () => setEditing(null),
  });

  return (
    <>
      <DocumentTitle title={t("nav.topics")} />
      <h1>{t("nav.topics")}</h1>
      <p className="lede">{t("topics.lead")}</p>
      <QueryBoundary query={topics}>
        {(data) => (
          <ul className="card-list">
            {data.items.map((topic) => (
              <li key={topic.id} className="card">
                {editing === topic.id ? (
                  <TopicForm
                    idPrefix={`topic-${topic.id}`}
                    topic={topic}
                    submitLabel={t("editorial.save")}
                    pending={update.isPending}
                    error={update.error}
                    onSubmit={(values) => update.mutate({ topic, values })}
                    onCancel={() => {
                      update.reset();
                      setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    <h2 className="card-title">
                      {locale === "bo" && topic.name_bo ? topic.name_bo : topic.name_en}
                    </h2>
                    <p className="card-meta">
                      <code>{topic.slug}</code>
                      <span>
                        {topic.is_active ? t("topics.activeState") : t("topics.inactiveState")}
                      </span>
                    </p>
                    <div className="button-row">
                      <Button variant="secondary" onClick={() => setEditing(topic.id)}>
                        {t("editorial.edit")}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {adding ? (
        <>
          <h2>{t("topics.add")}</h2>
          <TopicForm
            idPrefix="new-topic"
            submitLabel={t("topics.add")}
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
        <div className="button-row">
          <Button onClick={() => setAdding(true)}>{t("topics.add")}</Button>
        </div>
      )}
    </>
  );
}
