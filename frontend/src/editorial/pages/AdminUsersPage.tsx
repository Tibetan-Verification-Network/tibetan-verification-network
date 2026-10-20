import { useState } from "react";

import { useAdminUsers, useEditorialMutation } from "../../api/editorial/queries";
import type { InviteResult, UserSummary } from "../../api/editorial/types";
import { STAFF_ROLES, type StaffRole } from "../../api/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { CheckboxField } from "../../components/Fields";
import { DocumentTitle } from "../../components/DocumentTitle";
import { TextField } from "../../components/TextField";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { QueryBoundary } from "../components/QueryBoundary";

function RoleChoices({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: StaffRole[];
  onChange: (next: StaffRole[]) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="plain-fieldset">
      <legend>{t("admin.roles")}</legend>
      {STAFF_ROLES.map((role) => (
        <CheckboxField
          key={role}
          id={`${idPrefix}-${role}`}
          label={t(`role.${role}`)}
          checked={value.includes(role)}
          onChange={(event) =>
            onChange(
              event.target.checked ? [...value, role] : value.filter((item) => item !== role),
            )
          }
        />
      ))}
    </fieldset>
  );
}

function InviteSection() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>(["researcher"]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const invite = useEditorialMutation<void, InviteResult>({
    success: "admin.invited",
    mutationFn: (_, api) =>
      api.send<InviteResult>("POST", "/api/v1/admin/invites", {
        email: email.trim(),
        role_codes: roles,
      }),
    onSuccess: (data) => {
      setResult(data);
      setEmail("");
    },
  });
  const link = result
    ? `${window.location.origin}/activate?token=${encodeURIComponent(result.token)}`
    : "";
  return (
    <section aria-labelledby="invite-heading" className="stack">
      <h2 id="invite-heading">{t("admin.invite.title")}</h2>
      <form
        className="stack form-wide"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <TextField
          id="invite-email"
          label={t("admin.email")}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <RoleChoices idPrefix="invite-role" value={roles} onChange={setRoles} />
        <EditorialError error={invite.error} />
        <div className="button-row">
          <Button
            type="submit"
            disabled={email.trim() === "" || roles.length === 0 || invite.isPending}
          >
            {t("admin.invite.button")}
          </Button>
        </div>
      </form>
      {result ? (
        <div className="alert alert-info" role="status">
          <p>
            {t("admin.invite.created", {
              email: result.email,
              date: formatDate(locale, result.expires_at),
            })}
          </p>
          <p className="hint">{t("admin.invite.once")}</p>
          <p>
            <code className="wrap-anywhere">{link}</code>
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function AdminUsersPage() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const users = useAdminUsers();
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [disabling, setDisabling] = useState<UserSummary | null>(null);

  const saveRoles = useEditorialMutation<void, UserSummary>({
    success: "admin.rolesSaved",
    mutationFn: (_, api) =>
      api.send<UserSummary>("PUT", `/api/v1/admin/users/${editing?.id ?? ""}/roles`, {
        role_codes: roles,
      }),
    onSuccess: () => setEditing(null),
  });
  const disable = useEditorialMutation<string, UserSummary>({
    success: "admin.disabled",
    mutationFn: (id, api) => api.send<UserSummary>("POST", `/api/v1/admin/users/${id}/disable`),
    onSuccess: () => setDisabling(null),
  });

  return (
    <>
      <DocumentTitle title={t("nav.admin")} />
      <h1>{t("nav.admin")}</h1>
      <p className="lede">{t("admin.lead")}</p>
      <InviteSection />
      <section aria-labelledby="users-heading" className="stack">
        <h2 id="users-heading">{t("admin.users")}</h2>
        <QueryBoundary query={users}>
          {(data) => (
            <ul className="card-list">
              {data.items.map((member) => (
                <li key={member.id} className="card">
                  <h3 className="card-title">{member.display_name ?? member.email}</h3>
                  <p className="card-meta">
                    <span>{member.email}</span>
                    <span>{member.roles.map((role) => t(`role.${role}`)).join(", ")}</span>
                    <span>{member.is_active ? t("admin.active") : t("admin.disabledState")}</span>
                  </p>
                  {member.is_active ? (
                    <div className="button-row">
                      <Button
                        variant="secondary"
                        aria-label={t("admin.editRolesFor", {
                          name: member.display_name ?? member.email,
                        })}
                        onClick={() => {
                          setEditing(member);
                          setRoles(member.roles);
                        }}
                      >
                        {t("admin.editRoles")}
                      </Button>
                      {member.id !== me?.id ? (
                        <Button
                          variant="secondary"
                          aria-label={t("admin.disableFor", {
                            name: member.display_name ?? member.email,
                          })}
                          onClick={() => setDisabling(member)}
                        >
                          {t("admin.disable")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </section>
      {editing ? (
        <ConfirmDialog
          title={t("admin.editRoles")}
          consequence={t("admin.editRolesConsequence", {
            name: editing.display_name ?? editing.email,
          })}
          confirmLabel={t("editorial.save")}
          confirmDisabled={roles.length === 0}
          pending={saveRoles.isPending}
          error={<EditorialError error={saveRoles.error} />}
          onCancel={() => {
            saveRoles.reset();
            setEditing(null);
          }}
          onConfirm={() => saveRoles.mutate()}
        >
          <RoleChoices idPrefix="edit-role" value={roles} onChange={setRoles} />
        </ConfirmDialog>
      ) : null}
      {disabling ? (
        <ConfirmDialog
          title={t("admin.disable")}
          consequence={t("admin.disableConsequence", {
            name: disabling.display_name ?? disabling.email,
          })}
          confirmLabel={t("admin.disable")}
          typedConfirmation={disabling.email}
          pending={disable.isPending}
          error={<EditorialError error={disable.error} />}
          onCancel={() => {
            disable.reset();
            setDisabling(null);
          }}
          onConfirm={() => disable.mutate(disabling.id)}
        />
      ) : null}
    </>
  );
}
