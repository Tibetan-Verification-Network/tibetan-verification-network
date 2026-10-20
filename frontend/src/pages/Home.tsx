import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { topicCount, topicName } from "../api/public";
import { useFactCheckList, useTopics } from "../api/publicQueries";
import { Button } from "../components/Button";
import { DocumentTitle } from "../components/DocumentTitle";
import { FactCheckCard } from "../components/FactCheckCard";
import { LoadingState, QueryError } from "../components/QueryState";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

const LATEST_COUNT = 6;

export function Home() {
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const latest = useFactCheckList({ lang: locale, limit: LATEST_COUNT });
  const topics = useTopics();

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(
      trimmed === "" ? to("fact-checks") : `${to("fact-checks")}?q=${encodeURIComponent(trimmed)}`,
    );
  }

  const cards = latest.data?.pages[0]?.items ?? [];
  const visibleTopics = (topics.data?.items ?? []).filter((topic) => topicCount(topic, locale) > 0);

  return (
    <>
      <DocumentTitle title={t("product.name")} />
      <p className="eyebrow">{t("product.tagline")}</p>
      <h1>{t("product.name")}</h1>
      <p className="lede">{t("home.lede")}</p>

      <form
        className="search-form"
        role="search"
        aria-label={t("home.searchLabel")}
        onSubmit={onSearch}
      >
        <div className="field">
          <label htmlFor="home-search">{t("home.searchLabel")}</label>
          <input
            id="home-search"
            type="search"
            name="q"
            value={query}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button type="submit">{t("home.searchSubmit")}</Button>
      </form>

      <section aria-labelledby="home-mission">
        <h2 id="home-mission">{t("home.mission.title")}</h2>
        <p className="measure">{t("home.mission.body")}</p>
      </section>

      <section aria-labelledby="home-latest">
        <h2 id="home-latest">{t("home.latest.title")}</h2>
        {latest.isPending ? <LoadingState /> : null}
        {latest.isError ? (
          <QueryError messageKey="search.error" onRetry={() => void latest.refetch()} />
        ) : null}
        {latest.isSuccess && cards.length === 0 ? <p>{t("home.latest.empty")}</p> : null}
        {cards.length > 0 ? (
          <div className="card-list">
            {cards.map((card) => (
              <FactCheckCard key={`${card.language}:${card.slug}`} card={card} headingLevel={3} />
            ))}
          </div>
        ) : null}
        <p>
          <Link className="text-link" to={to("fact-checks")}>
            {t("home.latest.all")}
          </Link>
        </p>
      </section>

      {visibleTopics.length > 0 ? (
        <section aria-labelledby="home-topics">
          <h2 id="home-topics">{t("home.topics.title")}</h2>
          <ul className="chip-list">
            {visibleTopics.map((topic) => (
              <li key={topic.slug}>
                <Link
                  className="chip"
                  to={`${to("fact-checks")}?topic=${encodeURIComponent(topic.slug)}`}
                >
                  {topicName(topic, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="home-how">
        <h2 id="home-how">{t("home.how.title")}</h2>
        <ol className="measure">
          <li>{t("home.how.step1")}</li>
          <li>{t("home.how.step2")}</li>
          <li>{t("home.how.step3")}</li>
        </ol>
      </section>

      <section aria-labelledby="home-submit" className="callout">
        <h2 id="home-submit">{t("home.submit.title")}</h2>
        <p className="measure">{t("home.submit.body")}</p>
        <Link className="button button-primary" to={to("submit")}>
          {t("home.submit.cta")}
        </Link>
      </section>

      <section aria-labelledby="home-policy">
        <h2 id="home-policy">{t("home.policy.title")}</h2>
        <ul>
          <li>
            <Link to={`${to("about")}#methodology`}>{t("home.policy.methodology")}</Link>
          </li>
          <li>
            <Link to={`${to("about")}#verdicts`}>{t("home.policy.verdicts")}</Link>
          </li>
          <li>
            <Link to={`${to("about")}#corrections`}>{t("home.policy.corrections")}</Link>
          </li>
        </ul>
      </section>
    </>
  );
}
