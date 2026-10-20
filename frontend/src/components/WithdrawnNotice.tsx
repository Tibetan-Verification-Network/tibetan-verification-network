import type { PublicSnapshot } from "../api/public";
import { formatDate } from "../i18n/format";
import { useI18n } from "../i18n/useI18n";
import { Alert } from "./Alert";

/** Withdrawn articles show the notice only, never the withdrawn body. */
export function WithdrawnNotice({ snapshot }: { snapshot: PublicSnapshot }) {
  const { locale, t } = useI18n();
  return (
    <>
      <h1>{t("article.withdrawn.title")}</h1>
      <p className="withdrawn-title" lang={snapshot.language}>
        {snapshot.title}
      </p>
      <Alert tone="info">
        <h2 className="alert-heading">{t("article.withdrawn.notice")}</h2>
        <p className="preline" lang={snapshot.language}>
          {snapshot.withdrawal_notice}
        </p>
        <p>{t("article.withdrawn.date", { date: formatDate(locale, snapshot.published_at) })}</p>
      </Alert>
    </>
  );
}
