import { useEffect, useState } from "react";

import { loadReadiness, type Readiness } from "../api/readiness";
import { useAuth } from "../auth/useAuth";
import { DocumentTitle } from "../components/DocumentTitle";
import { useI18n } from "../i18n/useI18n";

export function Home() {
  const { t } = useI18n();
  const { baseUrl } = useAuth();
  const [state, setState] = useState<Readiness | "loading">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void loadReadiness(baseUrl, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setState(result);
      }
    });
    return () => controller.abort();
  }, [baseUrl]);

  const statusText = {
    loading: t("home.status.loading"),
    ready: t("home.status.ready"),
    not_ready: t("home.status.notReady"),
  }[state];

  return (
    <>
      <DocumentTitle title={t("product.name")} />
      <p className="eyebrow">{t("product.tagline")}</p>
      <h1>{t("product.name")}</h1>
      <p className="lede">{t("home.lede")}</p>
      <p className="status" role="status" aria-live="polite" aria-busy={state === "loading"}>
        {t("home.apiStatus", { status: statusText })}
      </p>
    </>
  );
}
