import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useDraft, useFactCheck, useInvestigation } from "../../api/editorial/queries";
import { useAuth } from "../../auth/useAuth";
import { DocumentTitle } from "../../components/DocumentTitle";
import { isLocale } from "../../i18n/translate";
import { useI18n } from "../../i18n/useI18n";
import type { MessageKey } from "../../i18n/locales/en";
import { AuditPanel } from "../components/AuditPanel";
import { NoAccess } from "../components/NoAccess";
import { ObjectHeader } from "../components/ObjectHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { LanguageStatusBadge } from "../components/StatusBadge";
import { DraftEditor } from "../factcheck/DraftEditor";
import { PublishPanel } from "../factcheck/PublishPanel";
import { ReadinessPanel } from "../factcheck/ReadinessPanel";
import { ReviewPanel } from "../factcheck/ReviewPanel";
import { VersionsPanel } from "../factcheck/VersionsPanel";
import { can } from "../roles";
import type { LanguageStatus } from "../../api/editorial/types";

const NEXT: Record<LanguageStatus, MessageKey> = {
  draft: "language.next.draft",
  in_review: "language.next.in_review",
  changes_requested: "language.next.changes_requested",
  ready_for_approval: "language.next.ready_for_approval",
  approved: "language.next.approved",
  published: "language.next.published",
  withdrawn: "language.next.withdrawn",
};

export function LanguagePage() {
  const { id = "", language = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [dirty, setDirty] = useState(false);
  const locale = isLocale(language) ? language : "en";
  const draft = useDraft(id, locale);
  const factCheck = useFactCheck(id);
  const investigationId = factCheck.data?.fact_check.investigation_id ?? "";
  const investigation = useInvestigation(investigationId);

  if (!isLocale(language)) {
    return <NoAccess />;
  }

  return (
    <QueryBoundary query={draft}>
      {(data) => {
        const status = data.editorial_status;
        const editable =
          can.editDraft(user) && (status === "draft" || status === "changes_requested");
        const slug = factCheck.data?.fact_check.public_slug ?? null;
        return (
          <>
            <DocumentTitle title={data.title ?? t("factcheck.untitled")} />
            <p>
              <Link to={`/editorial/factchecks/${id}`}>{t("factcheck.back")}</Link>
            </p>
            <ObjectHeader
              eyebrow={t(`language.${language}`)}
              title={data.title ?? t("factcheck.untitled")}
              lang={language}
              badges={
                <>
                  <LanguageStatusBadge status={status} />
                  <span className="status-badge">
                    {t("approvals.revision", { revision: String(data.current_revision_number) })}
                  </span>
                </>
              }
              nextAction={t(NEXT[status])}
            />

            <ReadinessPanel id={id} language={language} />
            {/* Keyed by status so a reopen or a withdrawal starts from the server's draft. */}
            <DraftEditor
              key={`${status}`}
              draft={data}
              editable={editable}
              sources={investigation.data?.sources ?? []}
              onDirtyChange={setDirty}
            />
            <ReviewPanel draft={data} status={status} dirty={dirty} />
            <PublishPanel draft={data} status={status} slug={slug} />
            <VersionsPanel id={id} language={language} />
            {factCheck.data?.languages.find((entry) => entry.language === language) ? (
              <AuditPanel
                subjectType="fact_check_content"
                subjectId={
                  factCheck.data.languages.find((entry) => entry.language === language)
                    ?.content_id ?? ""
                }
              />
            ) : null}
          </>
        );
      }}
    </QueryBoundary>
  );
}
