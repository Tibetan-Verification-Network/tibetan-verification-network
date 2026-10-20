import { Link } from "react-router-dom";

import { topicCount, topicDescription, topicName } from "../api/public";
import { useTopics } from "../api/publicQueries";
import { DocumentTitle } from "../components/DocumentTitle";
import { LoadingState, QueryError } from "../components/QueryState";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

export function TopicsPage() {
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const topics = useTopics();
  const items = topics.data?.items ?? [];

  return (
    <>
      <DocumentTitle title={t("topics.title")} />
      <h1>{t("topics.title")}</h1>
      <p className="lede">{t("topics.lead")}</p>
      {topics.isPending ? <LoadingState /> : null}
      {topics.isError ? (
        <QueryError messageKey="topics.error" onRetry={() => void topics.refetch()} />
      ) : null}
      {topics.isSuccess && items.length === 0 ? <p>{t("topics.empty")}</p> : null}
      {items.length > 0 ? (
        <ul className="card-list plain-list">
          {items.map((topic) => {
            const description = topicDescription(topic, locale);
            return (
              <li key={topic.slug} className="card">
                <h2 className="card-title">
                  <Link to={to(`topics/${encodeURIComponent(topic.slug)}`)}>
                    {topicName(topic, locale)}
                  </Link>
                </h2>
                {description ? <p className="card-summary">{description}</p> : null}
                <p className="card-meta">
                  {t("topics.count", { count: String(topicCount(topic, locale)) })}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
