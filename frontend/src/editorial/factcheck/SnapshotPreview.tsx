import type { PublicSnapshot } from "../../api/public";
import { SanitizedHtml } from "../../components/SanitizedHtml";
import { VerdictBadge } from "../../components/VerdictBadge";
import { useI18n } from "../../i18n/useI18n";
import { safeHttpUrl } from "../text";

/**
 * A plain rendering of a public snapshot for staff: the same fields the reader will see,
 * without the public site's links or lookups.
 */
export function SnapshotPreview({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lang = snapshot.language;
  return (
    <article className="snapshot-preview" lang={lang}>
      <p>
        <VerdictBadge verdict={snapshot.verdict} />
      </p>
      <h3>{snapshot.title}</h3>
      {snapshot.summary ? <p className="lede">{snapshot.summary}</p> : null}
      <h4>{t("article.verdictExplanation")}</h4>
      <p className="preline">{snapshot.verdict_explanation}</p>
      <h4>{t("article.claim")}</h4>
      <blockquote className="preline">{snapshot.claim_text}</blockquote>
      <h4>{t("article.context")}</h4>
      <p className="preline">{snapshot.context_text}</p>
      <h4>{t("article.analysis")}</h4>
      <SanitizedHtml html={snapshot.analysis_html} lang={lang} />
      {snapshot.limitations_html.trim() !== "" ? (
        <>
          <h4>{t("article.limitations")}</h4>
          <SanitizedHtml html={snapshot.limitations_html} lang={lang} />
        </>
      ) : null}
      <h4>{t("article.sources")}</h4>
      {snapshot.sources.length === 0 ? (
        <p>{t("source.none")}</p>
      ) : (
        <ol>
          {snapshot.sources.map((source, index) => {
            const href = safeHttpUrl(source.url);
            return (
              <li key={`${index}:${source.title}`}>
                {href ? (
                  <a href={href} rel="noopener noreferrer nofollow" target="_blank">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                {source.publisher ? ` — ${source.publisher}` : ""}
                {source.relevance_note ? (
                  <span className="hint"> ({source.relevance_note})</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {snapshot.topics.length > 0 ? (
        <p>
          <strong>{t("article.topics")}:</strong> {snapshot.topics.join(", ")}
        </p>
      ) : null}
      {snapshot.correction_note ? (
        <p>
          <strong>{t("version.correctionNote")}:</strong> {snapshot.correction_note}
        </p>
      ) : null}
      {snapshot.withdrawal_notice ? (
        <p>
          <strong>{t("version.withdrawalNotice")}:</strong> {snapshot.withdrawal_notice}
        </p>
      ) : null}
      <p className="attribution">{snapshot.attribution}</p>
    </article>
  );
}
