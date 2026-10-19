import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { I18nContext, type I18nContextValue } from "./context";
import type { MessageKey } from "./locales/en";
import { detectLocale, storeLocale } from "./storage";
import { translate, type Locale } from "./translate";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, values?: Record<string, string>) => translate(locale, key, values),
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
