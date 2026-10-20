import { Link } from "react-router-dom";

import { useTopics } from "../api/publicQueries";
import { topicName, type PublicSnapshot, type PublicSource } from "../api/public";
import { formatDate } from "../i18n/format";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";
import { SanitizedHtml } from "./SanitizedHtml";
import { VerdictBadge } from "./VerdictBadge";

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

function SourceItem({ source }: { source: PublicSource }) {
  const { locale, t } = useI18n();
  const href = safeHttpUrl(source.url);
  return (
    <li className="source">
      <p className="source-title">
        {href !== null ? (
          <a href={href} rel="noopener noreferrer nofollow">
            {source.title}
          </a>
        ) : (
          source.title
        )}
      </p>
      <dl className="source-meta">
        {source.publisher ? (
          <div>
            <dt>{t("article.sourcePublisher")}</dt>
            <dd>{source.publisher}</dd>
          </div>
        ) : null}
        {source.published_at ? (
          <div>
            <dt>{t("article.sourceDate")}</dt>
            <dd>{formatDate(locale, source.published_at)}</dd>
          </div>
        ) : null}
        {source.relevance_note ? (
          <div>
            <dt>{t("article.sourceRelevance")}</dt>
            <dd>{source.relevance_note}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

/** The reader-facing article sections in PRD order, up to and including attribution. */
export function ArticleBody({ snapshot }: { snapshot: PublicSnapshot }) {
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const topics = useTopics();
  const names = new Map((topics.data?.items ?? []).map((topic) => [topic.slug, topic]));
  const lang = snapshot.language;

  return (
    <>
      <header className="article-header">
        <VerdictBadge verdict={snapshot.verdict} linked />
        <h1 lang={lang}>{snapshot.title}</h1>
        {snapshot.summary ? (
          <p className="lede" lang={lang}>
            {snapshot.summary}
          </p>
        ) : null}
        {snapshot.topics.length > 0 ? (
          <ul className="chip-list" aria-label={t("article.topics")}>
            {snapshot.topics.map((slug) => {
              const topic = names.get(slug);
              return (
                <li key={slug}>
                  <Link
                    className="chip"
                    to={`${to("fact-checks")}?topic=${encodeURIComponent(slug)}`}
                  >
                    {topic ? topicName(topic, locale) : slug}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </header>

      <section aria-labelledby="article-explanation" lang={lang}>
        <h2 id="article-explanation">{t("article.verdictExplanation")}</h2>
        <p className="measure preline">{snapshot.verdict_explanation}</p>
      </section>

      <section aria-labelledby="article-claim" lang={lang}>
        <h2 id="article-claim">{t("article.claim")}</h2>
        <blockquote className="claim preline">{snapshot.claim_text}</blockquote>
      </section>

      <section aria-labelledby="article-context" lang={lang}>
        <h2 id="article-context">{t("article.context")}</h2>
        <p className="measure preline">{snapshot.context_text}</p>
      </section>

      <section aria-labelledby="article-analysis" lang={lang}>
        <h2 id="article-analysis">{t("article.analysis")}</h2>
        <SanitizedHtml html={snapshot.analysis_html} lang={lang} />
      </section>

      {snapshot.limitations_html.trim() !== "" ? (
        <section aria-labelledby="article-limitations" lang={lang}>
          <h2 id="article-limitations">{t("article.limitations")}</h2>
          <SanitizedHtml html={snapshot.limitations_html} lang={lang} />
        </section>
      ) : null}

      {snapshot.sources.length > 0 ? (
        <section aria-labelledby="article-sources" lang={lang}>
          <h2 id="article-sources">{t("article.sources")}</h2>
          <ol className="source-list">
            {snapshot.sources.map((source, index) => (
              <SourceItem key={`${index}:${source.title}`} source={source} />
            ))}
          </ol>
        </section>
      ) : null}

      <p className="attribution" lang={lang}>
        {snapshot.attribution}
      </p>
    </>
  );
}
