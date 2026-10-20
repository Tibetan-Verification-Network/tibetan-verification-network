import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  useArchiveDocument,
  useArchiveGrants,
  useEditorialMutation,
  useStaffDirectory,
} from "../../api/editorial/queries";
import {
  ARCHIVE_VISIBILITIES,
  type AccessLink,
  type ArchiveDocument,
  type ArchiveGrant,
  type ArchiveVisibility,
} from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { SelectField, TextAreaField } from "../../components/Fields";
import { DocumentTitle } from "../../components/DocumentTitle";
import { TextField } from "../../components/TextField";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";
import { InternalPanel } from "../components/InternalPanel";
import { ObjectHeader } from "../components/ObjectHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { formatBytes } from "../text";
import { can } from "../roles";
import { useUserNames } from "../useUserNames";

function AccessLinkSection({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const [link, setLink] = useState<AccessLink | null>(null);
  const create = useEditorialMutation<void, AccessLink>({
    mutationFn: (_, api) =>
      api.send<AccessLink>("POST", `/api/v1/archive/documents/${id}/access-link`),
    onSuccess: setLink,
  });
  return (
    <section aria-labelledby="access-heading" className="stack">
      <h2 id="access-heading">{t("archive.access.title")}</h2>
      <p>{t("archive.access.lead")}</p>
      <div className="button-row">
        <Button disabled={create.isPending} onClick={() => create.mutate()}>
          {t("archive.access.create")}
        </Button>
      </div>
      <EditorialError error={create.error} />
      {link ? (
        <p role="status">
          <a href={link.url} rel="noopener noreferrer" target="_blank">
            {t("archive.access.open")}
          </a>{" "}
          <span className="hint">
            {t("archive.access.expires", { date: formatDate(locale, link.expires_at) })}
          </span>
        </p>
      ) : null}
    </section>
  );
}

function ClassifySection({ document }: { document: ArchiveDocument }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<ArchiveVisibility>(document.visibility);
  const [reason, setReason] = useState("");
  const classify = useEditorialMutation<void, ArchiveDocument>({
    success: "archive.classified",
    mutationFn: (_, api) =>
      api.send<ArchiveDocument>("POST", `/api/v1/archive/documents/${document.id}/classification`, {
        visibility,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
    },
  });
  const publicTarget = visibility === "public_document" || visibility === "public_metadata";
  return (
    <section aria-labelledby="classify-heading" className="stack">
      <h2 id="classify-heading">{t("archive.classify.title")}</h2>
      <p>{t("archive.classify.lead")}</p>
      <div className="button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("archive.classify.button")}
        </Button>
      </div>
      {open ? (
        <ConfirmDialog
          title={t("archive.classify.button")}
          consequence={
            publicTarget
              ? t("archive.classify.publicConsequence")
              : t("archive.classify.consequence")
          }
          confirmLabel={t("archive.classify.button")}
          confirmDisabled={reason.trim() === "" || visibility === document.visibility}
          pending={classify.isPending}
          error={<EditorialError error={classify.error} />}
          onCancel={() => {
            classify.reset();
            setOpen(false);
          }}
          onConfirm={() => classify.mutate()}
        >
          <SelectField
            id="classify-visibility"
            label={t("archive.visibility")}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as ArchiveVisibility)}
            options={ARCHIVE_VISIBILITIES.map((value) => ({
              value,
              label: t(`archive.visibility.${value}`),
            }))}
          />
          <TextAreaField
            id="classify-reason"
            label={t("editorial.reason")}
            hint={t("editorial.reasonHint")}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function GrantsSection({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const names = useUserNames();
  const grants = useArchiveGrants(id, true);
  const staff = useStaffDirectory(true);
  const [person, setPerson] = useState("");
  const [expires, setExpires] = useState("");
  const [revoking, setRevoking] = useState<ArchiveGrant | null>(null);

  const add = useEditorialMutation<void, ArchiveGrant>({
    success: "archive.grant.added",
    mutationFn: (_, api) =>
      api.send<ArchiveGrant>("POST", `/api/v1/archive/documents/${id}/grants`, {
        user_id: person,
        expires_at: expires === "" ? null : `${expires}T23:59:59Z`,
      }),
    onSuccess: () => {
      setPerson("");
      setExpires("");
    },
  });
  const revoke = useEditorialMutation<string, void>({
    success: "archive.grant.revoked",
    mutationFn: (userId, api) =>
      api.send<void>("DELETE", `/api/v1/archive/documents/${id}/grants/${userId}`),
    onSuccess: () => setRevoking(null),
  });

  return (
    <InternalPanel title={t("archive.grant.title")}>
      <p>{t("archive.grant.lead")}</p>
      <QueryBoundary query={grants}>
        {(data) => (
          <>
            {data.items.length === 0 ? <p>{t("archive.grant.none")}</p> : null}
            <ul className="plain-list">
              {data.items.map((grant) => (
                <li key={grant.id} className="row-between">
                  <span>
                    {names(grant.user_id)}
                    {grant.expires_at ? (
                      <span className="hint">
                        {" "}
                        ({t("archive.grant.until", { date: formatDate(locale, grant.expires_at) })})
                      </span>
                    ) : null}
                  </span>
                  <Button variant="secondary" onClick={() => setRevoking(grant)}>
                    {t("archive.grant.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryBoundary>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (person !== "") add.mutate();
        }}
      >
        <SelectField
          id="grant-person"
          label={t("archive.grant.person")}
          value={person}
          onChange={(event) => setPerson(event.target.value)}
          options={[
            { value: "", label: t("editorial.choose") },
            ...(staff.data?.items ?? []).map((member) => ({
              value: member.id,
              label: member.display_name ?? member.email,
            })),
          ]}
        />
        <TextField
          id="grant-expires"
          label={t("archive.grant.expires")}
          type="date"
          value={expires}
          onChange={(event) => setExpires(event.target.value)}
        />
        <Button type="submit" disabled={person === "" || add.isPending}>
          {t("archive.grant.add")}
        </Button>
      </form>
      <EditorialError error={add.error} />
      {revoking ? (
        <ConfirmDialog
          title={t("archive.grant.revoke")}
          consequence={t("archive.grant.revokeConsequence", { name: names(revoking.user_id) })}
          confirmLabel={t("archive.grant.revoke")}
          pending={revoke.isPending}
          error={<EditorialError error={revoke.error} />}
          onCancel={() => {
            revoke.reset();
            setRevoking(null);
          }}
          onConfirm={() => revoke.mutate(revoking.user_id)}
        />
      ) : null}
    </InternalPanel>
  );
}

export function ArchiveDocumentPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const query = useArchiveDocument(id);
  return (
    <QueryBoundary query={query}>
      {(document) => (
        <>
          <DocumentTitle title={document.title} />
          <p>
            <Link to="/editorial/archive">{t("nav.archive")}</Link>
          </p>
          <ObjectHeader
            eyebrow={t("nav.archive")}
            title={document.title}
            badges={
              <>
                <span className="status-badge">
                  {t(`archive.visibility.${document.visibility}`)}
                </span>
                <span className="status-badge">
                  {t(`archive.upload.${document.upload_status}`)}
                </span>
              </>
            }
          />
          <dl className="detail-list">
            {document.description ? (
              <div>
                <dt>{t("archive.description")}</dt>
                <dd className="preline">{document.description}</dd>
              </div>
            ) : null}
            {document.original_filename ? (
              <div>
                <dt>{t("archive.filename")}</dt>
                <dd>{document.original_filename}</dd>
              </div>
            ) : null}
            {document.mime_type ? (
              <div>
                <dt>{t("archive.type")}</dt>
                <dd>{document.mime_type}</dd>
              </div>
            ) : null}
            {document.byte_size !== null ? (
              <div>
                <dt>{t("archive.size")}</dt>
                <dd>{formatBytes(document.byte_size)}</dd>
              </div>
            ) : null}
            {document.sha256 ? (
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code>{document.sha256}</code>
                </dd>
              </div>
            ) : null}
          </dl>
          {document.investigation_id ? (
            <p>
              <Link to={`/editorial/investigations/${document.investigation_id}`}>
                {t("factcheck.openInvestigation")}
              </Link>
            </p>
          ) : null}
          {document.upload_status === "available" ? <AccessLinkSection id={id} /> : null}
          {can.classifyArchive(user) ? <ClassifySection document={document} /> : null}
          {can.classifyArchive(user) && document.visibility === "restricted" ? (
            <GrantsSection id={id} />
          ) : null}
        </>
      )}
    </QueryBoundary>
  );
}
