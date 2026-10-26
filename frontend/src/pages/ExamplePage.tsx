import { Link, useParams } from "react-router-dom";

import { DocumentTitle } from "../components/DocumentTitle";
import { VerdictBadge } from "../components/VerdictBadge";
import { demoCase } from "../demo/cases";
import { formatDate } from "../i18n/format";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";
import { NotFoundPage } from "./NotFoundPage";

function safeHttpUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A labeled preview of a report. It is not loaded from the public fact-check API. */
export function ExamplePage() {
  const { slug = "" } = useParams();
  const item = demoCase(slug);
  const { locale, t } = useI18n();
  const to = useLocalePath();

  if (item === undefined) {
    return <NotFoundPage />;
  }

  return (
    <article className="example-report" lang="en">
      <DocumentTitle title={item.title} />
      <p className="demo-flag demo-flag-page">{t("home.cases.demo")}</p>
      <p className="example-back">
        <Link className="text-link" to={`${to()}#home-cases`}>
          {t("example.back")}
        </Link>
      </p>
      <header className="article-header">
        <VerdictBadge verdict={item.verdict} linked />
        <h1>{item.title}</h1>
        <p className="lede">{item.summary}</p>
      </header>
      <p className="dates">
        <span>{t("card.reported", { date: formatDate(locale, item.reportedAt) })}</span>
      </p>

      <section aria-labelledby="example-status">
        <h2 id="example-status">{t("example.status")}</h2>
        <p className="measure">{item.status}</p>
      </section>

      <section aria-labelledby="example-claim">
        <h2 id="example-claim">{t("article.claim")}</h2>
        <blockquote className="claim">{item.claim}</blockquote>
      </section>

      <section aria-labelledby="example-finding">
        <h2 id="example-finding">{t("article.verdictExplanation")}</h2>
        <p className="measure">{item.explanation}</p>
      </section>

      <section aria-labelledby="example-limits">
        <h2 id="example-limits">{t("article.limitations")}</h2>
        <p className="measure">{item.limits}</p>
      </section>

      {item.sources.length > 0 ? (
        <section aria-labelledby="example-sources">
          <h2 id="example-sources">{t("article.sources")}</h2>
          <ol className="source-list">
            {item.sources.map((source) => {
              const href = safeHttpUrl(source.url);
              return (
                <li key={source.title} className="source">
                  <p className="source-title">
                    {href !== null ? (
                      <a href={href} rel="noopener noreferrer nofollow">
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                  </p>
                  <p className="card-meta">{source.publisher}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
