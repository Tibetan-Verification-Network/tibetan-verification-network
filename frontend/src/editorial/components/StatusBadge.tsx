import type { LanguageStatus, WorkflowStatus } from "../../api/editorial/types";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "../../i18n/useI18n";

/** Always text, never colour alone. The status class keeps the verdict colour. */
export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={`status-badge status-${status}`}>
      {t(`status.workflow.${status}`)}
    </Badge>
  );
}

export function LanguageStatusBadge({ status }: { status: LanguageStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={`status-badge status-${status}`}>
      {t(`status.language.${status}`)}
    </Badge>
  );
}
