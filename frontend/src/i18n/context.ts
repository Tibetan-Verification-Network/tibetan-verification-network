import { createContext } from "react";

import type { MessageKey } from "./locales/en";
import type { Locale } from "./translate";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
