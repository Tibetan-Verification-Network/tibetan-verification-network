import { Link, useParams } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";

import { useArchiveDocuments, useInvestigation } from "../../api/editorial/queries";
import { useAuth } from "../../auth/useAuth";
import { DocumentTitle } from "../../components/DocumentTitle";
import { useI18n } from "../../i18n/useI18n";
import { AuditPanel } from "../components/AuditPanel";
import { ObjectHeader } from "../components/ObjectHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { WorkflowBadge } from "../components/StatusBadge";
import { AssignmentsSection } from "../investigation/AssignmentsSection";
import { CreateFactCheck } from "../investigation/CreateFactCheck";
import { DocumentsSection } from "../investigation/DocumentsSection";
import { EvidenceSection } from "../investigation/EvidenceSection";
import { NotesSection } from "../investigation/NotesSection";
import { SourcesSection } from "../investigation/SourcesSection";
import { StatusSection } from "../investigation/StatusSection";
import { can } from "../roles";
import type { MessageKey } from "../../i18n/locales/en";

const FROZEN = new Set(["in_review", "changes_requested", "approved", "published"]);

export function InvestigationPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const query = useInvestigation(id);
  const documents = useArchiveDocuments(id);

  return (
    <QueryBoundary query={query}>
      {(detail) => {
        const status = detail.investigation.workflow_status;
        const frozen = FROZEN.has(status);
        const writable = can.writeEvidence(user) && !frozen && status !== "rejected";
        const hasFactCheck = detail.fact_check_id !== null;
        const next: MessageKey = hasFactCheck
          ? "investigation.next.factcheck"
          : status === "on_hold"
            ? "investigation.next.hold"
            : status === "rejected"
              ? "investigation.next.rejected"
              : detail.evidence_items.some((item) => item.verified_at === null)
                ? "investigation.next.verify"
                : "investigation.next.draft";
        return (
          <>
            <DocumentTitle title={t("investigation.title")} />
            <ObjectHeader
              eyebrow={t("investigation.title")}
              title={detail.claim.canonical_text}
              badges={<WorkflowBadge status={status} />}
              nextAction={t(next)}
            />
            {frozen ? <p className="alert alert-info">{t("investigation.frozen")}</p> : null}
            {hasFactCheck ? (
              <p>
                <Link
                  className={buttonVariants()}
                  data-slot="button"
                  to={`/editorial/factchecks/${detail.fact_check_id}`}
                >
                  {t("investigation.openFactCheck")}
                </Link>
              </p>
            ) : null}

            {can.writeEvidence(user) && !frozen && !hasFactCheck ? (
              <StatusSection detail={detail} />
            ) : null}
            <AssignmentsSection detail={detail} canAssign={can.assign(user) && !frozen} />
            <SourcesSection detail={detail} canWrite={writable} />
            <EvidenceSection detail={detail} documents={documents.items} canWrite={writable} />
            <DocumentsSection
              investigationId={id}
              documents={documents.items}
              canUpload={writable}
            />
            <NotesSection detail={detail} canEdit={writable} />
            {!hasFactCheck &&
            can.writeEvidence(user) &&
            status !== "rejected" &&
            status !== "on_hold" ? (
              <CreateFactCheck investigationId={id} />
            ) : null}
            <AuditPanel subjectType="investigation" subjectId={id} />
          </>
        );
      }}
    </QueryBoundary>
  );
}
