import { Link } from "react-router-dom";

import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";
import { DocumentTitle } from "./DocumentTitle";

export function ArticleNotFound() {
  const { t } = useI18n();
  const to = useLocalePath();
  return (
    <>
      <DocumentTitle title={t("article.notFound.title")} />
      <h1>{t("article.notFound.title")}</h1>
      <p>{t("article.notFound.body")}</p>
      <p>
        <Link to={to("fact-checks")}>{t("home.latest.all")}</Link>
      </p>
    </>
  );
}
