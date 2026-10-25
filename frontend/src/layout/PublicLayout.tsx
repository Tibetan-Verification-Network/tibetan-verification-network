import { Link, Outlet } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { UserIcon } from "../components/icons";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";
import { AppFrame, type NavItem } from "./AppFrame";

export function PublicLayout() {
  const { t } = useI18n();
  const { status } = useAuth();
  const to = useLocalePath();
  const items: readonly NavItem[] = [
    { to: to(), label: "nav.home", end: true },
    { to: to("fact-checks"), label: "nav.factChecks" },
    { to: to("topics"), label: "nav.topics" },
    { to: to("submit"), label: "nav.submit" },
    { to: to("about"), label: "nav.about" },
  ];
  const actions = (
    <Link
      className="header-icon-button"
      to={status === "authenticated" ? "/editorial" : "/login"}
      aria-label={status === "authenticated" ? t("nav.editorialDesk") : t("nav.login")}
    >
      <UserIcon />
    </Link>
  );

  return (
    <AppFrame navLabel={t("nav.publicLabel")} items={items} actions={actions} homeTo={to()}>
      <Outlet />
    </AppFrame>
  );
}
