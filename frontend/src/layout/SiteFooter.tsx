import { Link } from "react-router-dom";

import { Logo } from "../components/Logo";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

export function SiteFooter() {
  const { t } = useI18n();
  const to = useLocalePath();
  const year = String(new Date().getFullYear());

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
        </div>
        <nav aria-label={t("footer.explore")}>
          <p className="footer-label">{t("footer.explore")}</p>
          <ul>
            <li>
              <Link to={to("fact-checks")}>{t("nav.factChecks")}</Link>
            </li>
            <li>
              <Link to={to("topics")}>{t("nav.topics")}</Link>
            </li>
            <li>
              <Link to={to("about")}>{t("nav.about")}</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t("footer.standards")}>
          <p className="footer-label">{t("footer.standards")}</p>
          <ul>
            <li>
              <Link to={`${to("about")}#methodology`}>{t("home.policy.methodology")}</Link>
            </li>
            <li>
              <Link to={`${to("about")}#verdicts`}>{t("home.policy.verdicts")}</Link>
            </li>
            <li>
              <Link to={`${to("about")}#corrections`}>{t("home.policy.corrections")}</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t("footer.participate")}>
          <p className="footer-label">{t("footer.participate")}</p>
          <ul>
            <li>
              <Link to={to("submit")}>{t("nav.submit")}</Link>
            </li>
            <li>
              <Link to="/login">{t("nav.login")}</Link>
            </li>
          </ul>
        </nav>
        <p className="footer-meta">{t("footer.rights", { year })}</p>
        <p className="footer-meta">{t("footer.contact")}</p>
      </div>
    </footer>
  );
}
