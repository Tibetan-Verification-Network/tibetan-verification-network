import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { VERDICTS } from "../api/public";
import { DocumentTitle } from "../components/DocumentTitle";
import { VerdictBadge } from "../components/VerdictBadge";
import { useI18n } from "../i18n/useI18n";

export function AboutPage() {
  const { t } = useI18n();
  const { hash } = useLocation();

  useEffect(() => {
    if (hash.length > 1) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    }
  }, [hash]);

  return (
    <>
      <DocumentTitle title={t("about.title")} />
      <h1>{t("about.title")}</h1>

      <section aria-labelledby="mission">
        <h2 id="mission">{t("about.mission.title")}</h2>
        <p className="measure">{t("about.mission.body")}</p>
      </section>

      <section aria-labelledby="methodology">
        <h2 id="methodology">{t("about.methodology.title")}</h2>
        <p className="measure">{t("about.methodology.body1")}</p>
        <p className="measure">{t("about.methodology.body2")}</p>
      </section>

      <section aria-labelledby="verdicts">
        <h2 id="verdicts">{t("about.verdicts.title")}</h2>
        <p className="measure">{t("about.verdicts.lead")}</p>
        <dl className="verdict-definitions">
          {VERDICTS.map((verdict) => (
            <div key={verdict} id={`verdict-${verdict}`} className="verdict-definition">
              <dt>
                <VerdictBadge verdict={verdict} />
              </dt>
              <dd>{t(`verdict.def.${verdict}`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="corrections">
        <h2 id="corrections">{t("about.corrections.title")}</h2>
        <p className="measure">{t("about.corrections.body")}</p>
      </section>
    </>
  );
}
