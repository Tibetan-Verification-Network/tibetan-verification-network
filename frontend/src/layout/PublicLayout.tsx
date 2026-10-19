import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { useI18n } from "../i18n/useI18n";
import { AppFrame, type NavItem } from "./AppFrame";

const PUBLIC_NAV: readonly NavItem[] = [
  { to: "/", label: "nav.home", end: true },
  { to: "/fact-checks", label: "nav.factChecks" },
  { to: "/submit", label: "nav.submit" },
  { to: "/about", label: "nav.about" },
];

export function PublicLayout() {
  const { t } = useI18n();
  const { status } = useAuth();
  const actions =
    status === "authenticated" ? (
      <Link className="text-link" to="/editorial">
        {t("nav.editorialDesk")}
      </Link>
    ) : (
      <Link className="text-link" to="/login">
        {t("nav.login")}
      </Link>
    );

  return (
    <AppFrame navLabel={t("nav.publicLabel")} items={PUBLIC_NAV} actions={actions}>
      <Outlet />
    </AppFrame>
  );
}
