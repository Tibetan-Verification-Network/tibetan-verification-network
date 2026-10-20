import { useState } from "react";

import { useEditorialMutation, useStaffDirectory } from "../../api/editorial/queries";
import type { InvestigationDetail } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { SelectField } from "../../components/Fields";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { useUserNames } from "../useUserNames";

export function AssignmentsSection({
  detail,
  canAssign,
}: {
  detail: InvestigationDetail;
  canAssign: boolean;
}) {
  const { t } = useI18n();
  const id = detail.investigation.id;
  const names = useUserNames();
  const staff = useStaffDirectory(canAssign);
  const [person, setPerson] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const active = detail.assignments.filter((assignment) => assignment.removed_at === null);

  const add = useEditorialMutation<string, InvestigationDetail>({
    success: "investigation.assignments.added",
    mutationFn: (userId, api) =>
      api.send<InvestigationDetail>("POST", `/api/v1/investigations/${id}/assignments`, {
        user_id: userId,
        assignment_role: "contributor",
      }),
    onSuccess: () => setPerson(""),
  });
  const remove = useEditorialMutation<string, InvestigationDetail>({
    success: "investigation.assignments.removed",
    mutationFn: (userId, api) =>
      api.send<InvestigationDetail>("DELETE", `/api/v1/investigations/${id}/assignments/${userId}`),
  });

  const assignedIds = new Set(active.map((assignment) => assignment.user_id));
  const options = (staff.data?.items ?? []).filter((member) => !assignedIds.has(member.id));

  return (
    <section aria-labelledby="assignments-heading" className="stack">
      <h2 id="assignments-heading">{t("investigation.assignments.title")}</h2>
      <ul className="plain-list">
        {active.map((assignment) => (
          <li key={assignment.user_id} className="row-between">
            <span>
              {names(assignment.user_id)}{" "}
              <span className="hint">
                ({t(`investigation.role.${assignment.assignment_role}`)})
              </span>
            </span>
            {canAssign && assignment.assignment_role !== "owner" ? (
              <Button variant="secondary" onClick={() => setRemoving(assignment.user_id)}>
                {t("investigation.assignments.remove")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canAssign ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (person !== "") {
              add.mutate(person);
            }
          }}
        >
          <SelectField
            id="assignment-person"
            label={t("investigation.assignments.add")}
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            options={[
              { value: "", label: t("editorial.choose") },
              ...options.map((member) => ({
                value: member.id,
                label: member.display_name ?? member.email,
              })),
            ]}
          />
          <Button type="submit" disabled={person === "" || add.isPending}>
            {t("investigation.assignments.addButton")}
          </Button>
        </form>
      ) : null}
      <EditorialError error={add.error} />
      {removing !== null ? (
        <ConfirmDialog
          title={t("investigation.assignments.remove")}
          consequence={t("investigation.assignments.removeConsequence", { name: names(removing) })}
          confirmLabel={t("investigation.assignments.remove")}
          pending={remove.isPending}
          error={<EditorialError error={remove.error} />}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() => remove.mutate(removing, { onSuccess: () => setRemoving(null) })}
        />
      ) : null}
    </section>
  );
}
