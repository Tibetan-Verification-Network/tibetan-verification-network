import type { ReactNode } from "react";

import { useI18n } from "../../i18n/useI18n";

/**
 * Heading, status badges, and the one thing that should happen next, so every object page
 * starts the same way.
 */
export function ObjectHeader({
  eyebrow,
  title,
  badges,
  nextAction,
  lang,
}: {
  eyebrow?: string;
  title: string;
  badges?: ReactNode;
  nextAction?: ReactNode;
  lang?: string;
}) {
  const { t } = useI18n();
  return (
    <header className="object-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 lang={lang}>{title}</h1>
      {badges ? <p className="badge-row">{badges}</p> : null}
      {nextAction ? (
        <p className="next-action">
          <strong>{t("editorial.nextAction")}</strong> {nextAction}
        </p>
      ) : null}
    </header>
  );
}
