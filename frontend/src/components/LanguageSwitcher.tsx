import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/translate";

const OPTIONS: readonly { locale: Locale; label: "language.en" | "language.bo"; lang: Locale }[] = [
  { locale: "en", label: "language.en", lang: "en" },
  { locale: "bo", label: "language.bo", lang: "bo" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          lang={option.lang}
          aria-pressed={locale === option.locale}
          onClick={() => setLocale(option.locale)}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}
