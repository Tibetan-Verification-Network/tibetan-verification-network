import { useState } from "react";

import { useEditorialMutation } from "../../api/editorial/queries";
import type { InvestigationDetail } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { TextAreaField } from "../../components/Fields";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";

type Target = "researching" | "drafting" | "on_hold" | "rejected";

export function StatusSection({ detail }: { detail: InvestigationDetail }) {
  const { t } = useI18n();
  const id = detail.investigation.id;
  const current = detail.investigation.workflow_status;
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");

  const change = useEditorialMutation<{ status: Target; reason?: string }, InvestigationDetail>({
    success: "investigation.status.done",
    mutationFn: (body, api) =>
      api.send<InvestigationDetail>("POST", `/api/v1/investigations/${id}/status`, body),
  });

  const needsReason = target === "on_hold" || target === "rejected";

  function close() {
    change.reset();
    setTarget(null);
    setReason("");
  }

  const options: { status: Target; label: string }[] = [
    { status: "researching", label: t("investigation.status.researching") },
    { status: "drafting", label: t("investigation.status.drafting") },
    { status: "on_hold", label: t("investigation.status.on_hold") },
    { status: "rejected", label: t("investigation.status.rejected") },
  ];

  return (
    <section aria-labelledby="status-heading" className="stack">
      <h2 id="status-heading">{t("investigation.status.title")}</h2>
      {detail.hold_reason && current === "on_hold" ? (
        <p>
          <strong>{t("investigation.holdReason")}</strong> {detail.hold_reason}
        </p>
      ) : null}
      {detail.reject_reason && current === "rejected" ? (
        <p>
          <strong>{t("investigation.rejectReason")}</strong> {detail.reject_reason}
        </p>
      ) : null}
      <div className="button-row">
        {options
          .filter((option) => option.status !== current)
          .map((option) => (
            <Button
              key={option.status}
              variant="secondary"
              onClick={() => setTarget(option.status)}
            >
              {option.label}
            </Button>
          ))}
      </div>
      {target !== null ? (
        <ConfirmDialog
          title={options.find((option) => option.status === target)?.label ?? ""}
          consequence={
            target === "rejected"
              ? t("investigation.status.rejectConsequence")
              : target === "on_hold"
                ? t("investigation.status.holdConsequence")
                : t("investigation.status.moveConsequence")
          }
          confirmLabel={options.find((option) => option.status === target)?.label ?? ""}
          confirmDisabled={needsReason && reason.trim() === ""}
          pending={change.isPending}
          error={<EditorialError error={change.error} />}
          onCancel={close}
          onConfirm={() =>
            change.mutate(
              needsReason ? { status: target, reason: reason.trim() } : { status: target },
              { onSuccess: close },
            )
          }
        >
          {needsReason ? (
            <TextAreaField
              id="status-reason"
              label={t("editorial.reason")}
              hint={t("editorial.reasonHint")}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
