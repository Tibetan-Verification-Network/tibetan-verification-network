import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useClaims, useEditorialMutation, useInvestigations } from "../../api/editorial/queries";
import { WORKFLOW_STATUSES, type InvestigationDetail } from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { CheckboxField, SelectField } from "../../components/Fields";
import { DocumentTitle } from "../../components/DocumentTitle";
import { LoadingState } from "../../components/LoadingState";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { LoadMore } from "../components/LoadMore";
import { WorkflowBadge } from "../components/StatusBadge";
import { can } from "../roles";
import { excerpt } from "../text";

const RESEARCH_STATUSES = WORKFLOW_STATUSES.filter((status) =>
  [
    "researching",
    "drafting",
    "in_review",
    "changes_requested",
    "approved",
    "on_hold",
    "rejected",
  ].includes(status),
);

function NewInvestigation() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [claimId, setClaimId] = useState("");
  const claims = useClaims(open);

  const create = useEditorialMutation<string, InvestigationDetail>({
    success: "investigation.created",
    mutationFn: (id, api) =>
      api.send<InvestigationDetail>("POST", "/api/v1/investigations", { claim_id: id }),
    onSuccess: (data) => {
      setOpen(false);
      void navigate(`/editorial/investigations/${data.investigation.id}`);
    },
  });

  return (
    <>
      <div className="button-row">
        <Button onClick={() => setOpen(true)}>{t("investigations.new")}</Button>
      </div>
      {open ? (
        <ConfirmDialog
          title={t("investigations.new")}
          consequence={t("investigations.newConsequence")}
          confirmLabel={t("investigations.new")}
          confirmDisabled={claimId === ""}
          pending={create.isPending}
          error={<EditorialError error={create.error} />}
          onCancel={() => {
            create.reset();
            setOpen(false);
          }}
          onConfirm={() => create.mutate(claimId)}
        >
          <SelectField
            id="new-investigation-claim"
            label={t("investigations.claim")}
            value={claimId}
            onChange={(event) => setClaimId(event.target.value)}
            options={[
              { value: "", label: t("editorial.choose") },
              ...claims.items.map((claim) => ({
                value: claim.id,
                label: excerpt(claim.canonical_text, 100),
              })),
            ]}
          />
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function InvestigationsPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const mine = params.get("mine") === "1";
  const list = useInvestigations({
    mine,
    workflow_status: status === "" ? undefined : status,
  });

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "") {
      next.delete(name);
    } else {
      next.set(name, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <>
      <DocumentTitle title={t("nav.investigations")} />
      <h1>{t("nav.investigations")}</h1>
      <p className="lede">{t("investigations.lead")}</p>
      {can.createInvestigation(user) ? <NewInvestigation /> : null}

      <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <SelectField
          id="investigations-status"
          label={t("inbox.filter.status")}
          value={status}
          onChange={(event) => update("status", event.target.value)}
          options={[
            { value: "", label: t("search.any") },
            ...RESEARCH_STATUSES.map((value) => ({ value, label: t(`status.workflow.${value}`) })),
          ]}
        />
        <CheckboxField
          id="investigations-mine"
          label={t("investigations.mine")}
          checked={mine}
          onChange={(event) => update("mine", event.target.checked ? "1" : "")}
        />
      </form>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <EditorialError error={list.error} />
      ) : list.items.length === 0 ? (
        <p>{t("investigations.empty")}</p>
      ) : (
        <>
          <ul className="card-list">
            {list.items.map((item) => (
              <li key={item.id} className="card">
                <p className="badge-row">
                  <WorkflowBadge status={item.workflow_status} />
                </p>
                <h2 className="card-title">
                  <Link to={`/editorial/investigations/${item.id}`}>
                    {excerpt(item.claim_text, 160)}
                  </Link>
                </h2>
                <p className="card-meta">
                  <span>
                    {t("investigations.updated", { date: formatDate(locale, item.updated_at) })}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={list.hasNextPage}
            loading={list.isFetchingNextPage}
            onLoadMore={() => void list.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
