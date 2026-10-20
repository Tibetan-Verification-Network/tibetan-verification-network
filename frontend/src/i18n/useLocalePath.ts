import { useCallback } from "react";

import { localePath } from "./paths";
import { useI18n } from "./useI18n";

/** Returns a function that prefixes public paths with the active locale. */
export function useLocalePath(): (path?: string) => string {
  const { locale } = useI18n();
  return useCallback((path = "") => localePath(locale, path), [locale]);
}
