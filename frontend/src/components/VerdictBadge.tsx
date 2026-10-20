import { Link } from "react-router-dom";

import type { Verdict } from "../api/public";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

const ICONS: Record<Verdict, string> = {
  true: "✓",
  false: "✕",
  misleading: "!",
  unverified: "?",
  unclear: "~",
};

/** Text label plus icon plus colour, so the verdict never depends on colour alone. */
export function VerdictBadge({ verdict, linked = false }: { verdict: Verdict; linked?: boolean }) {
  const { t } = useI18n();
  const to = useLocalePath();
  const label = t(`verdict.${verdict}`);
  const content = (
    <>
      <span className="verdict-icon" aria-hidden="true">
        {ICONS[verdict]}
      </span>
      <span>{label}</span>
    </>
  );
  const className = `verdict-badge verdict-${verdict}`;
  if (!linked) {
    return <span className={className}>{content}</span>;
  }
  return (
    <Link
      className={className}
      to={`${to("about")}#verdict-${verdict}`}
      aria-label={`${t("verdict.label")}: ${label}. ${t("verdict.definition")}`}
    >
      {content}
    </Link>
  );
}
