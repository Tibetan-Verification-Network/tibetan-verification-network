import type { Locale } from "../../i18n/translate";
import { useReadiness } from "../../api/editorial/queries";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { readinessLabel } from "../components/readiness";

export function ReadinessPanel({ id, language }: { id: string; language: Locale }) {
  const { t } = useI18n();
  const readiness = useReadiness(id, language);
  return (
    <section aria-labelledby="readiness-heading" className="stack">
      <h2 id="readiness-heading">{t("readiness.title")}</h2>
      {readiness.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : readiness.isError ? (
        <EditorialError error={readiness.error} />
      ) : readiness.data.issues.length === 0 ? (
        <p className="alert alert-success">{t("readiness.ok")}</p>
      ) : (
        <>
          <p>{t("readiness.lead")}</p>
          <ul>
            {readiness.data.issues.map((issue) => (
              <li key={issue}>{readinessLabel(t, issue)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
