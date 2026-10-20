import { Alert } from "./Alert";
import { Button } from "./Button";
import { LoadingState } from "./LoadingState";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/locales/en";

export { LoadingState };

export function QueryError({
  messageKey,
  onRetry,
}: {
  messageKey: MessageKey;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="query-error">
      <Alert tone="error">{t(messageKey)}</Alert>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t("search.retry")}
        </Button>
      ) : null}
    </div>
  );
}
