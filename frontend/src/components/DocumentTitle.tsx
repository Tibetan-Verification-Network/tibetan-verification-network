import { useEffect } from "react";

import { useI18n } from "../i18n/useI18n";

export function DocumentTitle({ title }: { title: string }) {
  const { t } = useI18n();
  useEffect(() => {
    const product = t("product.name");
    document.title = title === product ? product : `${title} — ${product}`;
  }, [t, title]);
  return null;
}
