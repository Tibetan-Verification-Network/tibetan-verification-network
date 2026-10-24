import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { logout } from "../api/auth";
import { ApiError } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { useI18n } from "../i18n/useI18n";
import { NotificationProvider } from "../editorial/components/Notifications";
import { can } from "../editorial/roles";
import type { CurrentUser } from "../api/types";
import { AppFrame, type NavItem } from "./AppFrame";

/** Only links the person can use. The API still refuses everything else. */
function navFor(user: CurrentUser | null): NavItem[] {
  const items: NavItem[] = [{ to: "/editorial", label: "nav.overview", end: true }];
  if (can.triage(user)) {
    items.push({ to: "/editorial/inbox", label: "nav.inbox" });
  }
  if (can.workEditorially(user)) {
    items.push(
      { to: "/editorial/investigations", label: "nav.investigations" },
      { to: "/editorial/factchecks", label: "nav.factChecks" },
    );
  }
  if (can.decide(user)) {
    items.push({ to: "/editorial/approvals", label: "nav.approvals" });
  }
  if (can.workEditorially(user)) {
    items.push({ to: "/editorial/archive", label: "nav.archive" });
  }
  if (can.manageTopics(user)) {
    items.push({ to: "/editorial/topics", label: "nav.topics" });
  }
  if (can.administer(user)) {
    items.push({ to: "/editorial/admin/users", label: "nav.admin" });
  }
  items.push({ to: "/", label: "nav.publicSite", end: true });
  return items;
}

export function EditorialLayout() {
  const { t } = useI18n();
  const { baseUrl, setUser, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setError(null);
    setPending(true);
    try {
      await logout(baseUrl);
      setUser(null);
      navigate("/login", { replace: true });
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "errors.generic";
      const values = caught instanceof ApiError ? caught.values : undefined;
      setError(t(code, values));
      setPending(false);
    }
  }

  return (
    <AppFrame
      variant="editorial"
      navLabel={t("nav.editorialLabel")}
      items={navFor(user)}
      homeTo="/editorial"
      actions={
        <Button variant="secondary" disabled={pending} onClick={() => void onLogout()}>
          {t("nav.logout")}
        </Button>
      }
    >
      <NotificationProvider>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Outlet />
      </NotificationProvider>
    </AppFrame>
  );
}
