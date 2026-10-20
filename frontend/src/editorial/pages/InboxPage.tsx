import { Link, useSearchParams } from "react-router-dom";

import { useSubmissions } from "../../api/editorial/queries";
import { WORKFLOW_STATUSES } from "../../api/editorial/types";
import { DocumentTitle } from "../../components/DocumentTitle";
import { SelectField } from "../../components/Fields";
import { LoadingState } from "../../components/LoadingState";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { LoadMore } from "../components/LoadMore";
import { WorkflowBadge } from "../components/StatusBadge";
import { excerpt } from "../text";

const INBOX_STATUSES = WORKFLOW_STATUSES.filter((status) =>
  ["inbox", "triaged", "on_hold", "rejected"].includes(status),
);

export function InboxPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "inbox";
  const channel = params.get("channel") ?? "";
  const list = useSubmissions({
    workflow_status: status === "all" ? undefined : status,
    channel: channel === "" ? undefined : channel,
  });

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    setParams(next, { replace: true });
  }

  return (
    <>
      <DocumentTitle title={t("nav.inbox")} />
      <h1>{t("nav.inbox")}</h1>
      <p className="lede">{t("inbox.lead")}</p>

      <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <SelectField
          id="inbox-status"
          label={t("inbox.filter.status")}
          value={status}
          onChange={(event) => update("status", event.target.value)}
          options={[
            { value: "all", label: t("search.any") },
            ...INBOX_STATUSES.map((value) => ({ value, label: t(`status.workflow.${value}`) })),
          ]}
        />
        <SelectField
          id="inbox-channel"
          label={t("inbox.filter.channel")}
          value={channel}
          onChange={(event) => update("channel", event.target.value)}
          options={[
            { value: "", label: t("search.any") },
            { value: "public_form", label: t("inbox.channel.public_form") },
            { value: "editorial", label: t("inbox.channel.editorial") },
            { value: "monitoring", label: t("inbox.channel.monitoring") },
          ]}
        />
      </form>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <EditorialError error={list.error} />
      ) : list.items.length === 0 ? (
        <p>{t("inbox.empty")}</p>
      ) : (
        <>
          <ul className="card-list">
            {list.items.map((item) => (
              <li key={item.id} className="card">
                <p className="badge-row">
                  <WorkflowBadge status={item.workflow_status} />
                </p>
                <h2 className="card-title">
                  <Link to={`/editorial/inbox/${item.id}`}>{excerpt(item.claim_text, 160)}</Link>
                </h2>
                <p className="card-meta">
                  <span>{t(`inbox.channel.${item.channel}`)}</span>
                  <span>{t("inbox.received", { date: formatDate(locale, item.created_at) })}</span>
                </p>
              </li>
            ))}
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
