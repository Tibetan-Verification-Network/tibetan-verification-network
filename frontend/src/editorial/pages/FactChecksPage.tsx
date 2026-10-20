import { Link, useSearchParams } from "react-router-dom";

import { useFactChecks } from "../../api/editorial/queries";
import { WORKFLOW_STATUSES } from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { CheckboxField, SelectField } from "../../components/Fields";
import { DocumentTitle } from "../../components/DocumentTitle";
import { LoadingState } from "../../components/LoadingState";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { LoadMore } from "../components/LoadMore";
import { LanguageStatusBadge, WorkflowBadge } from "../components/StatusBadge";
import { can } from "../roles";

const FACTCHECK_STATUSES = WORKFLOW_STATUSES.filter((status) =>
  ["drafting", "in_review", "changes_requested", "approved", "published"].includes(status),
);

export function FactChecksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const language = params.get("language") ?? "";
  const mine = params.get("mine") === "1";
  const awaiting = params.get("awaiting") === "1";
  const list = useFactChecks({
    workflow_status: status === "" ? undefined : status,
    language: language === "" ? undefined : language,
    mine,
    awaiting_my_approval: awaiting,
  });

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "") {
      next.delete(name);
    } else {
      next.set(name, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <>
      <DocumentTitle title={t("nav.factChecks")} />
      <h1>{t("nav.factChecks")}</h1>
      <p className="lede">{t("factchecks.lead")}</p>
      <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <SelectField
          id="factchecks-status"
          label={t("inbox.filter.status")}
          value={status}
          onChange={(event) => update("status", event.target.value)}
          options={[
            { value: "", label: t("search.any") },
            ...FACTCHECK_STATUSES.map((value) => ({ value, label: t(`status.workflow.${value}`) })),
          ]}
        />
        <SelectField
          id="factchecks-language"
          label={t("language.label")}
          value={language}
          onChange={(event) => update("language", event.target.value)}
          options={[
            { value: "", label: t("search.any") },
            { value: "bo", label: t("language.bo") },
            { value: "en", label: t("language.en") },
          ]}
        />
        <CheckboxField
          id="factchecks-mine"
          label={t("investigations.mine")}
          checked={mine}
          onChange={(event) => update("mine", event.target.checked ? "1" : "")}
        />
        {can.decide(user) ? (
          <CheckboxField
            id="factchecks-awaiting"
            label={t("factchecks.awaiting")}
            checked={awaiting}
            onChange={(event) => update("awaiting", event.target.checked ? "1" : "")}
          />
        ) : null}
      </form>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <EditorialError error={list.error} />
      ) : list.items.length === 0 ? (
        <p>{t("factchecks.empty")}</p>
      ) : (
        <>
          <ul className="card-list">
            {list.items.map((item) => {
              const title =
                item.languages.find((entry) => entry.title)?.title ??
                item.public_slug ??
                t("factcheck.untitled");
              return (
                <li key={item.id} className="card">
                  <p className="badge-row">
                    <WorkflowBadge status={item.workflow_status} />
                  </p>
                  <h2 className="card-title">
                    <Link to={`/editorial/factchecks/${item.id}`}>{title}</Link>
                  </h2>
                  <ul className="inline-list">
                    {item.languages.map((entry) => (
                      <li key={entry.language}>
                        <Link
                          to={`/editorial/factchecks/${item.id}/${entry.language}`}
                          aria-label={`${t(`language.${entry.language}`)}: ${t(`status.language.${entry.editorial_status}`)}`}
                        >
                          {t(`language.${entry.language}`)}
                        </Link>{" "}
                        <LanguageStatusBadge status={entry.editorial_status} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <LoadMore
            hasMore={list.hasNextPage}
            loading={list.isFetchingNextPage}
            onLoadMore={() => void list.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
