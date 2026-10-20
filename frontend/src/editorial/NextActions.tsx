import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  useApprovalQueue,
  useFactChecks,
  useInvestigations,
  useSubmissions,
} from "../api/editorial/queries";
import { useAuth } from "../auth/useAuth";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";
import { EditorialError } from "./components/EditorialError";
import { can } from "./roles";
import { excerpt } from "./text";

interface Row {
  key: string;
  to: string;
  label: string;
}

function ActionCard({
  title,
  emptyKey,
  state,
  rows,
  more,
  allTo,
}: {
  title: MessageKey;
  emptyKey: MessageKey;
  state: { isPending: boolean; isError: boolean; error: unknown };
  rows: Row[];
  more: boolean;
  allTo: string;
}): ReactNode {
  const { t } = useI18n();
  return (
    <section className="card" aria-label={t(title)}>
      <h3 className="card-title">
        <Link to={allTo}>{t(title)}</Link>
      </h3>
      {state.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : state.isError ? (
        <EditorialError error={state.error} />
      ) : rows.length === 0 ? (
        <p>{t(emptyKey)}</p>
      ) : (
        <>
          <ul className="plain-list">
            {rows.map((row) => (
              <li key={row.key}>
                <Link to={row.to}>{row.label}</Link>
              </li>
            ))}
          </ul>
          {more ? <p className="hint">{t("dashboard.more")}</p> : null}
        </>
      )}
    </section>
  );
}

/** What this person should do next, by role. Each list is whatever the API lets them see. */
export function NextActions() {
  const { t } = useI18n();
  const { user } = useAuth();
  const triage = can.triage(user);
  const work = can.workEditorially(user);
  const editor = can.review(user);
  const approver = can.decide(user);

  const inbox = useSubmissions({ workflow_status: "inbox" }, 5, triage);
  const mine = useInvestigations({ mine: true }, 5, triage);
  const drafts = useFactChecks({ mine: true }, 5, triage);
  const review = useFactChecks({ workflow_status: "in_review" }, 5, editor);
  const queue = useApprovalQueue(approver);

  if (!work) {
    return null;
  }
  return (
    <section aria-labelledby="next-actions-heading" className="stack">
      <h2 id="next-actions-heading">{t("dashboard.title")}</h2>
      <div className="card-list">
        {triage ? (
          <ActionCard
            title="dashboard.inbox"
            emptyKey="dashboard.inbox.empty"
            state={inbox}
            more={inbox.hasNextPage}
            allTo="/editorial/inbox"
            rows={inbox.items.map((item) => ({
              key: item.id,
              to: `/editorial/inbox/${item.id}`,
              label: excerpt(item.claim_text, 90),
            }))}
          />
        ) : null}
        {triage ? (
          <ActionCard
            title="dashboard.investigations"
            emptyKey="dashboard.investigations.empty"
            state={mine}
            more={mine.hasNextPage}
            allTo="/editorial/investigations?mine=1"
            rows={mine.items.map((item) => ({
              key: item.id,
              to: `/editorial/investigations/${item.id}`,
              label: excerpt(item.claim_text, 90),
            }))}
          />
        ) : null}
        {triage ? (
          <ActionCard
            title="dashboard.drafts"
            emptyKey="dashboard.drafts.empty"
            state={drafts}
            more={drafts.hasNextPage}
            allTo="/editorial/factchecks?mine=1"
            rows={drafts.items.map((item) => ({
              key: item.id,
              to: `/editorial/factchecks/${item.id}`,
              label:
                item.languages.find((entry) => entry.title)?.title ??
                item.public_slug ??
                t("factcheck.untitled"),
            }))}
          />
        ) : null}
        {editor ? (
          <ActionCard
            title="dashboard.review"
            emptyKey="dashboard.review.empty"
            state={review}
            more={review.hasNextPage}
            allTo="/editorial/factchecks?status=in_review"
            rows={review.items.map((item) => ({
              key: item.id,
              to: `/editorial/factchecks/${item.id}`,
              label:
                item.languages.find((entry) => entry.title)?.title ??
                item.public_slug ??
                t("factcheck.untitled"),
            }))}
          />
        ) : null}
        {approver ? (
          <ActionCard
            title="dashboard.approvals"
            emptyKey="dashboard.approvals.empty"
            state={queue}
            more={queue.hasNextPage}
            allTo="/editorial/approvals"
            rows={queue.items.slice(0, 5).map((item) => ({
              key: `${item.fact_check_id}:${item.language}`,
              to: `/editorial/factchecks/${item.fact_check_id}/${item.language}`,
              label: item.title ?? item.public_slug ?? t("factcheck.untitled"),
            }))}
          />
        ) : null}
      </div>
    </section>
  );
}
