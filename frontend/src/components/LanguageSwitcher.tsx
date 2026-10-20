import { useLocation, useNavigate } from "react-router-dom";

import { swapLocale } from "../i18n/paths";
import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/translate";

const OPTIONS: readonly { locale: Locale; label: "language.en" | "language.bo"; lang: Locale }[] = [
  { locale: "en", label: "language.en", lang: "en" },
  { locale: "bo", label: "language.bo", lang: "bo" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  function choose(next: Locale) {
    if (next === locale) {
      return;
    }
    const target = swapLocale(location.pathname, next);
    if (target !== null) {
      navigate(`${target}${location.search}${location.hash}`);
    }
    setLocale(next);
  }

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          lang={option.lang}
          aria-pressed={locale === option.locale}
          onClick={() => choose(option.locale)}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}
