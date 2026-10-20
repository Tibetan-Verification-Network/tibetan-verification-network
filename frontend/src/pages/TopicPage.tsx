import { Link, useParams } from "react-router-dom";

import { topicCount, topicDescription, topicName } from "../api/public";
import { useFactCheckList, useTopic } from "../api/publicQueries";
import { ApiError } from "../api/types";
import { DocumentTitle } from "../components/DocumentTitle";
import { FactCheckCard } from "../components/FactCheckCard";
import { LoadingState, QueryError } from "../components/QueryState";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

export function TopicPage() {
  const { slug = "" } = useParams();
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const topic = useTopic(slug);
  const list = useFactCheckList({ topic: slug, lang: locale, limit: 10 });

  if (topic.isPending) {
    return <LoadingState />;
  }
  if (topic.isError) {
    if (topic.error instanceof ApiError && topic.error.status === 404) {
      return (
        <>
          <DocumentTitle title={t("topics.notFound")} />
          <h1>{t("topics.notFound")}</h1>
          <p>
            <Link to={to("topics")}>{t("topics.title")}</Link>
          </p>
        </>
      );
    }
    return <QueryError messageKey="topics.error" onRetry={() => void topic.refetch()} />;
  }

  const name = topicName(topic.data, locale);
  const description = topicDescription(topic.data, locale);
  const cards = list.data?.pages[0]?.items ?? [];

  return (
    <>
      <DocumentTitle title={name} />
      <h1>{name}</h1>
      {description ? <p className="lede">{description}</p> : null}
      <p>{t("topics.count", { count: String(topicCount(topic.data, locale)) })}</p>

      <section aria-labelledby="topic-recent">
        <h2 id="topic-recent">{t("topics.recent")}</h2>
        {list.isPending ? <LoadingState /> : null}
        {list.isError ? (
          <QueryError messageKey="search.error" onRetry={() => void list.refetch()} />
        ) : null}
        {list.isSuccess && cards.length === 0 ? <p>{t("topics.noneRecent")}</p> : null}
        {cards.length > 0 ? (
          <div className="card-list">
            {cards.map((card) => (
              <FactCheckCard key={`${card.language}:${card.slug}`} card={card} headingLevel={3} />
            ))}
          </div>
        ) : null}
        <p>
          <Link className="text-link" to={`${to("fact-checks")}?topic=${encodeURIComponent(slug)}`}>
            {t("topics.viewAll")}
          </Link>
        </p>
      </section>
    </>
  );
}
