import { useEffect, useState } from "react";

import { loadEditorialProbe } from "../api/auth";
import type { StaffRole } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { DocumentTitle } from "../components/DocumentTitle";
import type { MessageKey } from "../i18n/locales/en";
import { NextActions } from "../editorial/NextActions";
import { useI18n } from "../i18n/useI18n";

const ROLE_LABELS = {
  platform_administrator: "role.platform_administrator",
  researcher: "role.researcher",
  editor: "role.editor",
  approver: "role.approver",
} as const satisfies Record<StaffRole, MessageKey>;

export function EditorialHome() {
  const { t } = useI18n();
  const { baseUrl, user } = useAuth();
  const [probe, setProbe] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void loadEditorialProbe(baseUrl, controller.signal)
      .then((ok) => {
        if (!controller.signal.aborted) {
          setProbe(ok ? "ok" : "fail");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProbe("fail");
        }
      });
    return () => controller.abort();
  }, [baseUrl]);

  const name = user?.displayName || user?.email || "";

  return (
    <>
      <DocumentTitle title={t("nav.overview")} />
      <h1>{t("nav.overview")}</h1>
      <p>{t("editorial.welcome", { name })}</p>
      <h2>{t("editorial.roles")}</h2>
      <ul>
        {user?.roles.map((role) => (
          <li key={role}>{t(ROLE_LABELS[role])}</li>
        ))}
      </ul>
      <NextActions />
      <p role="status">
        {probe === "loading"
          ? t("loading")
          : probe === "ok"
            ? t("editorial.protectedOk")
            : t("editorial.protectedFail")}
      </p>
    </>
  );
}
