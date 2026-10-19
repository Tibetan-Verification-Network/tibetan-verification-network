import { Navigate, Outlet, useLocation } from "react-router-dom";

import { DocumentTitle } from "../components/DocumentTitle";
import { LoadingState } from "../components/LoadingState";
import { useI18n } from "../i18n/useI18n";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const { t } = useI18n();
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <main id="main" tabIndex={-1}>
        <DocumentTitle title={t("loading")} />
        <LoadingState />
      </main>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
