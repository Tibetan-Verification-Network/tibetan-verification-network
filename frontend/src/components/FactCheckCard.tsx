import { Link } from "react-router-dom";

import { Card, CardDescription } from "@/components/ui/card";
import { topicName, type PublicCard } from "../api/public";
import { useTopics } from "../api/publicQueries";
import { formatDate } from "../i18n/format";
import { localePath } from "../i18n/paths";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";
import { VerdictBadge } from "./VerdictBadge";

export interface CardTag {
  slug: string;
  label: string;
}

export function FactCheckCard({
  card,
  headingLevel = 2,
  href,
  tags,
  demo = false,
  onTag,
}: {
  card: PublicCard;
  headingLevel?: 2 | 3;
  href?: string;
  tags?: readonly CardTag[];
  demo?: boolean;
  onTag?: (slug: string) => void;
}) {
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const topics = useTopics();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const destination =
    href ?? localePath(card.language, `fact-checks/${encodeURIComponent(card.slug)}`);
  const updated = card.last_published_at !== card.first_published_at;
  const names = new Map((topics.data?.items ?? []).map((topic) => [topic.slug, topic]));
  const resolved =
    tags ??
    card.topics.flatMap((slug) => {
      const topic = names.get(slug);
      return topic === undefined ? [] : [{ slug, label: topicName(topic, locale) }];
    });
  const dateLabel = demo
    ? t("card.reported", { date: formatDate(locale, card.first_published_at) })
    : t("card.published", { date: formatDate(locale, card.first_published_at) });

  return (
    <Card className={`result-card${demo ? " is-demo" : ""}`}>
      <div className="result-card-mast">
        <div className={`result-card-accent verdict-${card.verdict}`} aria-hidden="true" />
        {demo ? <p className="demo-flag">{t("home.cases.demo")}</p> : null}
      </div>
      <div className="result-card-top">
        <VerdictBadge verdict={card.verdict} />
      </div>
      <Heading className="card-title" lang={card.language}>
        <Link to={destination}>{card.title}</Link>
      </Heading>
      <CardDescription className="result-card-summary" lang={card.language}>
        {card.summary}
      </CardDescription>
      <div className="result-card-footer">
        <div className="result-card-tagline">
          {resolved.length > 0 ? (
            <ul className="result-card-tags" aria-label={t("article.topics")}>
              {resolved.map((tag) => (
                <li key={tag.slug}>
                  {onTag ? (
                    <button type="button" className="tag" onClick={() => onTag(tag.slug)}>
                      {tag.label}
                    </button>
                  ) : (
                    <Link
                      className="tag"
                      to={`${to("fact-checks")}?topic=${encodeURIComponent(tag.slug)}`}
                    >
                      {tag.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="card-meta">
          <span>{dateLabel}</span>
          <span>{t("card.language", { language: t(`language.${card.language}`) })}</span>
          {updated ? (
            <span>{t("card.updated", { date: formatDate(locale, card.last_published_at) })}</span>
          ) : null}
        </p>
      </div>
    </Card>
  );
}
