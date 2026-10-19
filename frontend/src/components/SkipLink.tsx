import { useI18n } from "../i18n/useI18n";

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}
    >
      {t("skip")}
    </a>
  );
}
