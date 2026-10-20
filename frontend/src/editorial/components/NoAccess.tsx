import type { ReactNode } from "react";

import type { StaffRole } from "../../api/types";
import { useAuth } from "../../auth/useAuth";
import { DocumentTitle } from "../../components/DocumentTitle";
import { useI18n } from "../../i18n/useI18n";
import { hasAnyRole } from "../roles";

/** Same wording the API's 404 produces: the page cannot tell "missing" from "not yours". */
export function NoAccess() {
  const { t } = useI18n();
  return (
    <>
      <DocumentTitle title={t("editorial.error.notFoundTitle")} />
      <h1>{t("editorial.error.notFoundTitle")}</h1>
      <p>{t("editorial.error.notFound")}</p>
    </>
  );
}

/** Keeps a screen out of reach of roles that cannot use it. The API still decides. */
export function RequireRole({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!hasAnyRole(user, ...roles)) {
    return <NoAccess />;
  }
  return <>{children}</>;
}
