import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { logout } from "../api/auth";
import { ApiError } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { useI18n } from "../i18n/useI18n";
import { AppFrame, type NavItem } from "./AppFrame";

const EDITORIAL_NAV: readonly NavItem[] = [
  { to: "/editorial", label: "nav.overview", end: true },
  { to: "/editorial/inbox", label: "nav.inbox" },
  { to: "/editorial/investigations", label: "nav.investigations" },
  { to: "/editorial/drafts", label: "nav.drafts" },
  { to: "/editorial/archive", label: "nav.archive" },
  { to: "/", label: "nav.publicSite", end: true },
];

export function EditorialLayout() {
  const { t } = useI18n();
  const { baseUrl, setUser } = useAuth();
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
      navLabel={t("nav.editorialLabel")}
      items={EDITORIAL_NAV}
      actions={
        <Button variant="secondary" disabled={pending} onClick={() => void onLogout()}>
          {t("nav.logout")}
        </Button>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Outlet />
    </AppFrame>
  );
}
