import { useId, type ReactNode } from "react";

import { useI18n } from "../../i18n/useI18n";

/**
 * Wraps content that must never reach the public site. The label and the pattern are fixed so
 * staff can tell internal text from public copy at a glance, and public fields never share a
 * panel with it.
 */
export function InternalPanel({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className="internal-panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="internal-label">{t("editorial.internal")}</p>
      {children}
    </section>
  );
}

export function PublicCopyPanel({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className="public-panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="public-label">{t("editorial.publicCopy")}</p>
      {children}
    </section>
  );
}
