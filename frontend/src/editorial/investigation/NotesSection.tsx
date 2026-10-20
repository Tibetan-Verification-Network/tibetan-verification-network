import { useState } from "react";

import { useEditorialMutation } from "../../api/editorial/queries";
import type { InvestigationDetail } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { TextAreaField } from "../../components/Fields";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { InternalPanel } from "../components/InternalPanel";

export function NotesSection({
  detail,
  canEdit,
}: {
  detail: InvestigationDetail;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const id = detail.investigation.id;
  const saved = detail.internal_notes ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;

  const save = useEditorialMutation<string, InvestigationDetail>({
    success: "investigation.notes.saved",
    mutationFn: (notes, api) =>
      api.send<InvestigationDetail>("PATCH", `/api/v1/investigations/${id}`, {
        internal_notes: notes,
      }),
    onSuccess: () => setDraft(null),
  });

  return (
    <InternalPanel title={t("investigation.notes.title")}>
      <p>{t("investigation.notes.lead")}</p>
      {canEdit ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(value);
          }}
        >
          <TextAreaField
            id="investigation-notes"
            label={t("investigation.notes.label")}
            rows={6}
            value={value}
            onChange={(event) => setDraft(event.target.value)}
          />
          <EditorialError error={save.error} />
          <div className="button-row">
            <Button type="submit" disabled={save.isPending || value === saved}>
              {save.isPending ? t("editorial.working") : t("editorial.save")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="preline">{saved === "" ? t("investigation.notes.none") : saved}</p>
      )}
    </InternalPanel>
  );
}
