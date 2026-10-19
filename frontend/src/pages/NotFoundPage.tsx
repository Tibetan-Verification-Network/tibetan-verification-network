import { DocumentTitle } from "../components/DocumentTitle";
import { useI18n } from "../i18n/useI18n";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <>
      <DocumentTitle title={t("notFound.title")} />
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
    </>
  );
}
