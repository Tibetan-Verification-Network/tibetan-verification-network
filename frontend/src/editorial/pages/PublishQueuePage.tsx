import { Link } from "react-router-dom";

import { usePublishQueue } from "../../api/editorial/queries";
import { DocumentTitle } from "../../components/DocumentTitle";
import { LoadingState } from "../../components/LoadingState";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { LoadMore } from "../components/LoadMore";

export function PublishQueuePage() {
  const { t, locale } = useI18n();
  const queue = usePublishQueue();
  return (
    <>
      <DocumentTitle title={t("nav.readyToPublish")} />
      <h1>{t("nav.readyToPublish")}</h1>
      <p className="lede">{t("publishQueue.lead")}</p>
      {queue.isPending ? (
        <LoadingState />
      ) : queue.isError ? (
        <EditorialError error={queue.error} />
      ) : queue.items.length === 0 ? (
        <p>{t("publishQueue.empty")}</p>
      ) : (
        <>
          <ul className="card-list">
            {queue.items.map((item) => (
              <li key={`${item.fact_check_id}:${item.language}`} className="card">
                <h2 className="card-title" lang={item.language}>
                  <Link to={`/editorial/factchecks/${item.fact_check_id}/${item.language}`}>
                    {item.title ?? item.public_slug ?? t("factcheck.untitled")}
                  </Link>
                </h2>
                <p className="card-meta">
                  <span>{t(`language.${item.language}`)}</span>
                  <span>
                    {t("approvals.revision", { revision: String(item.current_revision_number) })}
                  </span>
                  <span>
                    {t("investigations.updated", { date: formatDate(locale, item.updated_at) })}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={queue.hasNextPage}
            loading={queue.isFetchingNextPage}
            onLoadMore={() => void queue.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
