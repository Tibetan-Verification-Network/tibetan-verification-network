import { Link } from "react-router-dom";

import type { PublicCard } from "../api/public";
import { formatDate } from "../i18n/format";
import { localePath } from "../i18n/paths";
import { useI18n } from "../i18n/useI18n";
import { VerdictBadge } from "./VerdictBadge";

export function FactCheckCard({
  card,
  headingLevel = 2,
}: {
  card: PublicCard;
  headingLevel?: 2 | 3;
}) {
  const { locale, t } = useI18n();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const href = localePath(card.language, `fact-checks/${encodeURIComponent(card.slug)}`);
  const updated = card.last_published_at !== card.first_published_at;
  return (
    <article className="card">
      <VerdictBadge verdict={card.verdict} />
      <Heading className="card-title" lang={card.language}>
        <Link to={href}>{card.title}</Link>
      </Heading>
      {card.summary ? (
        <p className="card-summary" lang={card.language}>
          {card.summary}
        </p>
      ) : null}
      <p className="card-meta">
        <span>{t("card.language", { language: t(`language.${card.language}`) })}</span>
        <span>{t("card.published", { date: formatDate(locale, card.first_published_at) })}</span>
        {updated ? (
          <span>{t("card.updated", { date: formatDate(locale, card.last_published_at) })}</span>
        ) : null}
      </p>
    </article>
  );
}
