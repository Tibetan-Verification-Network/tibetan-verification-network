import { Link, useParams } from "react-router-dom";

import { useFactCheckVersion } from "../api/publicQueries";
import { ApiError } from "../api/types";
import { Alert } from "../components/Alert";
import { ArticleBody } from "../components/ArticleBody";
import { ArticleNotFound } from "../components/ArticleNotFound";
import { DocumentTitle } from "../components/DocumentTitle";
import { LoadingState, QueryError } from "../components/QueryState";
import { WithdrawnNotice } from "../components/WithdrawnNotice";
import { formatDate } from "../i18n/format";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

export function ArticleVersionPage() {
  const { slug = "", n = "" } = useParams();
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const versionNumber = /^\d+$/.test(n) ? Number(n) : 0;
  const query = useFactCheckVersion(slug, locale, versionNumber);

  if (versionNumber < 1) {
    return <ArticleNotFound />;
  }
  if (query.isPending) {
    return <LoadingState />;
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <ArticleNotFound />;
    }
    return <QueryError messageKey="article.error" onRetry={() => void query.refetch()} />;
  }

  const snapshot = query.data;
  return (
    <>
      <DocumentTitle title={snapshot.title} />
      <Alert tone="info">
        <p>
          {t("article.previousVersion", {
            number: String(versionNumber),
            date: formatDate(locale, snapshot.published_at),
          })}
        </p>
        <p>
          <Link className="text-link" to={`${to("fact-checks")}/${encodeURIComponent(slug)}`}>
            {t("article.backToCurrent")}
          </Link>
        </p>
      </Alert>
      {snapshot.kind === "withdrawal" ? (
        <WithdrawnNotice snapshot={snapshot} />
      ) : (
        <ArticleBody snapshot={snapshot} />
      )}
    </>
  );
}
