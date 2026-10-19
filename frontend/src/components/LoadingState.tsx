import { useI18n } from "../i18n/useI18n";

export function LoadingState() {
  const { t } = useI18n();
  return (
    <p className="loading" role="status" aria-live="polite" aria-busy="true">
      {t("loading")}
    </p>
  );
}
