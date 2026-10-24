import { Link } from "react-router-dom";

import { Card, CardDescription, CardHeader } from "@/components/ui/card";
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
    <Card className="result-card">
      <CardHeader>
        <VerdictBadge verdict={card.verdict} />
        <Heading className="card-title" lang={card.language}>
          <Link to={href}>{card.title}</Link>
        </Heading>
      </CardHeader>
      {card.summary ? <CardDescription lang={card.language}>{card.summary}</CardDescription> : null}
      <p className="card-meta">
        <span>{t("card.language", { language: t(`language.${card.language}`) })}</span>
        <span>{t("card.published", { date: formatDate(locale, card.first_published_at) })}</span>
        {updated ? (
          <span>{t("card.updated", { date: formatDate(locale, card.last_published_at) })}</span>
        ) : null}
      </p>
    </Card>
  );
}
