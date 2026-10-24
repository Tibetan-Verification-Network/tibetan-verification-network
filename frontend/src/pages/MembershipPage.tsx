import { DocumentTitle } from "../components/DocumentTitle";
import { useI18n } from "../i18n/useI18n";

export function MembershipPage() {
  const { t } = useI18n();

  return (
    <>
      <DocumentTitle title={t("home.member.title")} />
      <h1>{t("home.member.title")}</h1>
      <p className="lede">{t("home.member.body")}</p>
      <p className="form-note">{t("membership.note")}</p>
    </>
  );
}
