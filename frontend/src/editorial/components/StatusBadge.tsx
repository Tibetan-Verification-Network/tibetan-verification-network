import type { LanguageStatus, WorkflowStatus } from "../../api/editorial/types";
import { useI18n } from "../../i18n/useI18n";

/** Always text, never colour alone. */
export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  const { t } = useI18n();
  return <span className={`status-badge status-${status}`}>{t(`status.workflow.${status}`)}</span>;
}

export function LanguageStatusBadge({ status }: { status: LanguageStatus }) {
  const { t } = useI18n();
  return <span className={`status-badge status-${status}`}>{t(`status.language.${status}`)}</span>;
}
