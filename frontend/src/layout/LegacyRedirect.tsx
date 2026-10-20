import { Navigate, useLocation } from "react-router-dom";

import { useI18n } from "../i18n/useI18n";
import { localePath } from "../i18n/paths";

/**
 * Redirect an unprefixed public path to the reader's locale: the stored choice, then the
 * browser language, then English. The i18n provider already resolves that order.
 */
export function LegacyRedirect() {
  const { locale } = useI18n();
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${localePath(locale, pathname)}${search}${hash}`} replace />;
}
