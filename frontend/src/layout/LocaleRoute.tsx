import { useLayoutEffect } from "react";

import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/translate";
import { PublicLayout } from "./PublicLayout";

/**
 * Public layout for a locale-prefixed route. The URL is the source of truth, so the
 * i18n provider is synchronised before any child renders in the wrong language.
 */
export function LocaleRoute({ locale }: { locale: Locale }) {
  const { locale: active, setLocale } = useI18n();

  useLayoutEffect(() => {
    if (active !== locale) {
      setLocale(locale);
    }
  }, [active, locale, setLocale]);

  if (active !== locale) {
    return null;
  }
  return <PublicLayout />;
}
