import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { isVerdict, topicName, VERDICTS } from "../api/public";
import { useFactCheckList, useTopics } from "../api/publicQueries";
import { Button } from "../components/Button";
import { DocumentTitle } from "../components/DocumentTitle";
import { SelectField } from "../components/Fields";
import { FactCheckCard } from "../components/FactCheckCard";
import { LoadingState, QueryError } from "../components/QueryState";
import { TextField } from "../components/TextField";
import { isLocale, type Locale } from "../i18n/translate";
import { useI18n } from "../i18n/useI18n";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface Filters {
  q: string;
  lang: Locale | "all";
  verdict: string;
  topic: string;
  from: string;
  to: string;
}

function readFilters(params: URLSearchParams, locale: Locale): Filters {
  const lang = params.get("lang");
  const verdict = params.get("verdict") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    lang: lang === "all" ? "all" : isLocale(lang) ? lang : locale,
    verdict: isVerdict(verdict) ? verdict : "",
    topic: params.get("topic") ?? "",
    from: DATE_PATTERN.test(from) ? from : "",
    to: DATE_PATTERN.test(to) ? to : "",
  };
}

function toParams(filters: Filters, locale: Locale): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim() !== "") params.set("q", filters.q.trim());
  if (filters.lang !== locale) params.set("lang", filters.lang);
  if (filters.verdict !== "") params.set("verdict", filters.verdict);
  if (filters.topic !== "") params.set("topic", filters.topic);
  if (filters.from !== "") params.set("from", filters.from);
  if (filters.to !== "") params.set("to", filters.to);
  return params;
}

export function SearchPage() {
  const { locale, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = readFilters(searchParams, locale);
  const [draft, setDraft] = useState<Filters>(applied);

  // Keep the form in step with the URL when it changes from outside (back button, links).
  const signature = JSON.stringify(applied);
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (syncedSignature !== signature) {
    setSyncedSignature(signature);
    setDraft(applied);
  }

  const topics = useTopics();
  const list = useFactCheckList({
    q: applied.q.trim() === "" ? undefined : applied.q.trim(),
    lang: applied.lang === "all" ? undefined : applied.lang,
    verdict: applied.verdict === "" ? undefined : applied.verdict,
    topic: applied.topic === "" ? undefined : applied.topic,
    from: applied.from === "" ? undefined : `${applied.from}T00:00:00Z`,
    to: applied.to === "" ? undefined : `${applied.to}T23:59:59Z`,
  });

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSearchParams(toParams(draft, locale));
  }

  function onClear() {
    setSearchParams(new URLSearchParams());
  }

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const title = t("search.title");

  return (
    <>
      <DocumentTitle title={title} />
      <h1>{title}</h1>
      <p className="lede">{t("search.lead")}</p>

      <form className="search-form" role="search" aria-label={title} onSubmit={onSubmit}>
        <TextField
          id="search-q"
          label={t("search.query")}
          hint={t("search.queryHint")}
          type="search"
          name="q"
          value={draft.q}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => update("q", event.target.value)}
        />
        <fieldset className="filters">
          <legend>{t("search.filters")}</legend>
          <SelectField
            id="search-verdict"
            label={t("search.verdict")}
            value={draft.verdict}
            onChange={(event) => update("verdict", event.target.value)}
            options={[
              { value: "", label: t("search.any") },
              ...VERDICTS.map((verdict) => ({ value: verdict, label: t(`verdict.${verdict}`) })),
            ]}
          />
          <SelectField
            id="search-topic"
            label={t("search.topic")}
            value={draft.topic}
            onChange={(event) => update("topic", event.target.value)}
            options={[
              { value: "", label: t("search.any") },
              ...(topics.data?.items ?? []).map((topic) => ({
                value: topic.slug,
                label: topicName(topic, locale),
              })),
            ]}
          />
          <SelectField
            id="search-lang"
            label={t("search.language")}
            value={draft.lang}
            onChange={(event) => {
              const next = event.target.value;
              update("lang", next === "all" ? "all" : isLocale(next) ? next : locale);
            }}
            options={[
              { value: "en", label: t("language.en") },
              { value: "bo", label: t("language.bo") },
              { value: "all", label: t("search.langAll") },
            ]}
          />
          <TextField
            id="search-from"
            label={t("search.from")}
            type="date"
            value={draft.from}
            onChange={(event) => update("from", event.target.value)}
          />
          <TextField
            id="search-to"
            label={t("search.to")}
            type="date"
            value={draft.to}
            onChange={(event) => update("to", event.target.value)}
          />
        </fieldset>
        <div className="button-row">
          <Button type="submit">{t("search.submit")}</Button>
          <Button variant="secondary" onClick={onClear}>
            {t("search.clear")}
          </Button>
        </div>
      </form>

      <section aria-label={title} className="results">
        {list.isPending ? <LoadingState /> : null}
        {list.isError ? (
          <QueryError messageKey="search.error" onRetry={() => void list.refetch()} />
        ) : null}
        {list.isSuccess ? (
          <p className="result-count" role="status" aria-live="polite">
            {items.length === 0
              ? t("search.empty")
              : t("search.count", { count: String(items.length) })}
          </p>
        ) : null}
        {items.length > 0 ? (
          <div className="card-list">
            {items.map((card) => (
              <FactCheckCard key={`${card.language}:${card.slug}`} card={card} />
            ))}
          </div>
        ) : null}
        {list.hasNextPage ? (
          <Button
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? t("search.loadingMore") : t("search.loadMore")}
          </Button>
        ) : null}
      </section>
    </>
  );
}
