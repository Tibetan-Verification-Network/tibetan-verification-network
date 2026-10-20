import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  useClaims,
  useEditorialMutation,
  useInvestigations,
  useStaffDirectory,
  useSubmission,
  useSubmissionContact,
  withParams,
} from "../../api/editorial/queries";
import type {
  InvestigationListItem,
  Page,
  SubmissionDetail,
  TriageBody,
} from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { DocumentTitle } from "../../components/DocumentTitle";
import { SelectField, TextAreaField } from "../../components/Fields";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { InternalPanel } from "../components/InternalPanel";
import { ObjectHeader } from "../components/ObjectHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { WorkflowBadge } from "../components/StatusBadge";
import { can } from "../roles";
import { excerpt, safeHttpUrl } from "../text";

type DialogKind = "reject" | "hold" | "duplicate" | "createClaim" | "linkClaim" | "assign" | "open";

export function SubmissionPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const query = useSubmission(id);
  return (
    <QueryBoundary query={query}>
      {(detail) => (
        <>
          <DocumentTitle title={t("inbox.detailTitle")} />
          <SubmissionView id={id} detail={detail} />
        </>
      )}
    </QueryBoundary>
  );
}

function SubmissionView({ id, detail }: { id: string; detail: SubmissionDetail }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { submission } = detail;
  const sourceUrl = safeHttpUrl(submission.source_url);

  const nextAction =
    submission.workflow_status === "inbox"
      ? t("inbox.next.inbox")
      : submission.workflow_status === "triaged"
        ? t("inbox.next.triaged")
        : submission.workflow_status === "on_hold"
          ? t("inbox.next.on_hold")
          : undefined;

  return (
    <>
      <p>
        <Link to="/editorial/inbox">{t("inbox.back")}</Link>
      </p>
      <ObjectHeader
        eyebrow={t("nav.inbox")}
        title={t("inbox.detailTitle")}
        badges={<WorkflowBadge status={submission.workflow_status} />}
        nextAction={nextAction}
      />

      <section aria-labelledby="original-heading" className="stack">
        <h2 id="original-heading">{t("inbox.original")}</h2>
        <p className="card-meta">
          <span>{t("inbox.received", { date: formatDate(locale, submission.created_at) })}</span>
          <span>{t(`inbox.channel.${submission.channel}`)}</span>
        </p>
        <blockquote className="original-wording preline">{submission.claim_text}</blockquote>
        {submission.context_text ? (
          <>
            <h3>{t("inbox.context")}</h3>
            <p className="preline">{submission.context_text}</p>
          </>
        ) : null}
        {submission.source_url ? (
          <p>
            <strong>{t("inbox.sourceUrl")}</strong>{" "}
            {sourceUrl ? (
              <a href={sourceUrl} rel="noopener noreferrer nofollow" target="_blank">
                {sourceUrl}
              </a>
            ) : (
              <span>{submission.source_url}</span>
            )}
          </p>
        ) : null}
        {detail.claim ? (
          <p>
            <strong>{t("inbox.canonicalClaim")}</strong> {detail.claim.canonical_text}
          </p>
        ) : null}
      </section>

      {can.revealContact(user) ? <ContactPanel id={id} /> : null}

      {detail.duplicate_suggestions.length > 0 ? (
        <DuplicateSuggestions id={id} detail={detail} canTriage={can.triage(user)} />
      ) : null}

      {can.triage(user) ? <TriagePanel id={id} detail={detail} /> : null}
      {detail.claim ? <ClaimInvestigations claimId={detail.claim.id} /> : null}
    </>
  );
}

function ContactPanel({ id }: { id: string }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const contact = useSubmissionContact(id, revealed);

  return (
    <InternalPanel title={t("inbox.contact.title")}>
      {!revealed ? (
        <>
          <p>{t("inbox.contact.audited")}</p>
          <Button onClick={() => setRevealed(true)}>{t("inbox.contact.reveal")}</Button>
        </>
      ) : contact.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : contact.isError ? (
        <>
          <EditorialError error={contact.error} />
          <Button variant="secondary" onClick={() => setRevealed(false)}>
            {t("inbox.contact.hide")}
          </Button>
        </>
      ) : (
        <>
          {contact.data === null ||
          (!contact.data.contact_name &&
            !contact.data.contact_email &&
            !contact.data.contact_phone) ? (
            <p>{t("inbox.contact.none")}</p>
          ) : (
            <dl className="detail-list">
              <dt>{t("submit.contactName")}</dt>
              <dd>{contact.data.contact_name ?? "—"}</dd>
              <dt>{t("submit.contactEmail")}</dt>
              <dd>{contact.data.contact_email ?? "—"}</dd>
              <dt>{t("submit.contactPhone")}</dt>
              <dd>{contact.data.contact_phone ?? "—"}</dd>
              <dt>{t("inbox.contact.consent")}</dt>
              <dd>
                {contact.data.privacy_notice_acknowledged ? t("editorial.yes") : t("editorial.no")}
              </dd>
            </dl>
          )}
          <Button variant="secondary" onClick={() => setRevealed(false)}>
            {t("inbox.contact.hide")}
          </Button>
        </>
      )}
    </InternalPanel>
  );
}

function useTriage(id: string, success: "inbox.triage.done" | "inbox.triage.opened") {
  const navigate = useNavigate();
  return useEditorialMutation<TriageBody, string | null>({
    success,
    mutationFn: async (body, api) => {
      const result = await api.send<SubmissionDetail>(
        "POST",
        `/api/v1/editorial/submissions/${id}/triage`,
        body,
      );
      if (body.action !== "open_investigation" || result.submission.claim_id === null) {
        return null;
      }
      const found = await api.get<Page<InvestigationListItem>>(
        withParams("/api/v1/investigations", { claim_id: result.submission.claim_id, limit: 1 }),
      );
      return found.items[0]?.id ?? null;
    },
    onSuccess: (investigationId) => {
      if (investigationId !== null) {
        navigate(`/editorial/investigations/${investigationId}`);
      }
    },
  });
}

function DuplicateSuggestions({
  id,
  detail,
  canTriage,
}: {
  id: string;
  detail: SubmissionDetail;
  canTriage: boolean;
}) {
  const { t } = useI18n();
  const [target, setTarget] = useState<string | null>(null);
  const triage = useTriage(id, "inbox.triage.done");
  const current = detail.duplicate_suggestions.find((item) => item.id === target);

  return (
    <section aria-labelledby="duplicates-heading" className="stack">
      <h2 id="duplicates-heading">{t("inbox.duplicates.title")}</h2>
      <p>{t("inbox.duplicates.lead")}</p>
      <ul className="card-list">
        {detail.duplicate_suggestions.map((item) => (
          <li key={item.id} className="card">
            <p className="preline">{excerpt(item.claim_text, 240)}</p>
            <p className="card-meta">
              <WorkflowBadge status={item.workflow_status} />
              <span>
                {item.exact_match
                  ? t("inbox.duplicates.exact")
                  : t("inbox.duplicates.similarity", {
                      percent: String(Math.round((item.similarity ?? 0) * 100)),
                    })}
              </span>
              <Link to={`/editorial/inbox/${item.id}`}>{t("inbox.duplicates.open")}</Link>
            </p>
            {canTriage ? (
              <Button variant="secondary" onClick={() => setTarget(item.id)}>
                {t("inbox.duplicates.mark")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {current ? (
        <ConfirmDialog
          title={t("inbox.duplicates.mark")}
          consequence={t("inbox.duplicates.consequence")}
          confirmLabel={t("inbox.duplicates.mark")}
          pending={triage.isPending}
          error={<EditorialError error={triage.error} />}
          onCancel={() => {
            triage.reset();
            setTarget(null);
          }}
          onConfirm={() =>
            triage.mutate(
              { action: "mark_duplicate", duplicate_of_id: current.id },
              { onSuccess: () => setTarget(null) },
            )
          }
        />
      ) : null}
    </section>
  );
}

function TriagePanel({ id, detail }: { id: string; detail: SubmissionDetail }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [reason, setReason] = useState("");
  const [canonical, setCanonical] = useState(detail.submission.claim_text);
  const [claimId, setClaimId] = useState("");
  const [assignee, setAssignee] = useState("");

  const triage = useTriage(id, "inbox.triage.done");
  const open = useTriage(id, "inbox.triage.opened");
  const claims = useClaims(dialog === "linkClaim");
  const staff = useStaffDirectory(dialog === "assign");

  function close() {
    triage.reset();
    open.reset();
    setDialog(null);
    setReason("");
  }

  function run(body: TriageBody) {
    triage.mutate(body, { onSuccess: close });
  }

  const reasonOk = reason.trim().length >= 3;

  return (
    <section aria-labelledby="triage-heading" className="stack">
      <h2 id="triage-heading">{t("inbox.triage.title")}</h2>
      <div className="button-row">
        <Button onClick={() => setDialog("open")}>{t("inbox.triage.open")}</Button>
        <Button variant="secondary" onClick={() => setDialog("createClaim")}>
          {t("inbox.triage.createClaim")}
        </Button>
        <Button variant="secondary" onClick={() => setDialog("linkClaim")}>
          {t("inbox.triage.linkClaim")}
        </Button>
        {can.assign(user) ? (
          <Button variant="secondary" onClick={() => setDialog("assign")}>
            {t("inbox.triage.assign")}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => setDialog("hold")}>
          {t("inbox.triage.hold")}
        </Button>
        <Button variant="secondary" onClick={() => setDialog("reject")}>
          {t("inbox.triage.reject")}
        </Button>
      </div>

      {dialog === "open" ? (
        <ConfirmDialog
          title={t("inbox.triage.open")}
          consequence={t("inbox.triage.openConsequence")}
          confirmLabel={t("inbox.triage.open")}
          pending={open.isPending}
          error={<EditorialError error={open.error} />}
          onCancel={close}
          onConfirm={() => open.mutate({ action: "open_investigation" })}
        />
      ) : null}

      {dialog === "reject" || dialog === "hold" ? (
        <ConfirmDialog
          title={dialog === "reject" ? t("inbox.triage.reject") : t("inbox.triage.hold")}
          consequence={
            dialog === "reject"
              ? t("inbox.triage.rejectConsequence")
              : t("inbox.triage.holdConsequence")
          }
          confirmLabel={dialog === "reject" ? t("inbox.triage.reject") : t("inbox.triage.hold")}
          confirmDisabled={!reasonOk}
          pending={triage.isPending}
          error={<EditorialError error={triage.error} />}
          onCancel={close}
          onConfirm={() => run({ action: dialog, reason: reason.trim() })}
        >
          <TextAreaField
            id="triage-reason"
            label={t("editorial.reason")}
            hint={t("editorial.reasonHint")}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {dialog === "createClaim" ? (
        <ConfirmDialog
          title={t("inbox.triage.createClaim")}
          consequence={t("inbox.triage.createClaimConsequence")}
          confirmLabel={t("inbox.triage.createClaim")}
          confirmDisabled={canonical.trim().length < 3}
          pending={triage.isPending}
          error={<EditorialError error={triage.error} />}
          onCancel={close}
          onConfirm={() => run({ action: "create_claim", canonical_text: canonical.trim() })}
          wide
        >
          <TextAreaField
            id="triage-canonical"
            label={t("inbox.canonicalClaim")}
            rows={4}
            value={canonical}
            onChange={(event) => setCanonical(event.target.value)}
          />
        </ConfirmDialog>
      ) : null}

      {dialog === "linkClaim" ? (
        <ConfirmDialog
          title={t("inbox.triage.linkClaim")}
          consequence={t("inbox.triage.linkClaimConsequence")}
          confirmLabel={t("inbox.triage.linkClaim")}
          confirmDisabled={claimId === ""}
          pending={triage.isPending}
          error={<EditorialError error={triage.error} />}
          onCancel={close}
          onConfirm={() => run({ action: "link_to_claim", claim_id: claimId })}
        >
          {claims.isPending ? (
            <p role="status">{t("loading")}</p>
          ) : (
            <SelectField
              id="triage-claim"
              label={t("inbox.triage.claim")}
              value={claimId}
              onChange={(event) => setClaimId(event.target.value)}
              options={[
                { value: "", label: t("editorial.choose") },
                ...claims.items.map((claim) => ({
                  value: claim.id,
                  label: excerpt(claim.canonical_text, 90),
                })),
              ]}
            />
          )}
        </ConfirmDialog>
      ) : null}

      {dialog === "assign" ? (
        <ConfirmDialog
          title={t("inbox.triage.assign")}
          consequence={t("inbox.triage.assignConsequence")}
          confirmLabel={t("inbox.triage.assign")}
          confirmDisabled={assignee === ""}
          pending={triage.isPending}
          error={<EditorialError error={triage.error} />}
          onCancel={close}
          onConfirm={() => run({ action: "assign", user_id: assignee })}
        >
          {staff.isPending ? (
            <p role="status">{t("loading")}</p>
          ) : (
            <SelectField
              id="triage-assignee"
              label={t("editorial.person")}
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              options={[
                { value: "", label: t("editorial.choose") },
                ...(staff.data?.items ?? []).map((member) => ({
                  value: member.id,
                  label: member.display_name ?? member.email,
                })),
              ]}
            />
          )}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function ClaimInvestigations({ claimId }: { claimId: string }) {
  const { t } = useI18n();
  const list = useInvestigations({ claim_id: claimId }, 10);
  if (list.isPending || list.items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="claim-investigations" className="stack">
      <h2 id="claim-investigations">{t("inbox.investigations")}</h2>
      <ul className="plain-list">
        {list.items.map((item) => (
          <li key={item.id}>
            <Link to={`/editorial/investigations/${item.id}`}>{excerpt(item.claim_text, 100)}</Link>{" "}
            <WorkflowBadge status={item.workflow_status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
