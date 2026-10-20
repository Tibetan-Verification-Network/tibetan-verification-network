import { useId, useState } from "react";

import { useAudit } from "../../api/editorial/queries";
import type { AuditEvent, AuditSubject } from "../../api/editorial/types";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { can } from "../roles";
import { useUserNames } from "../useUserNames";
import { EditorialError } from "./EditorialError";
import { LoadMore } from "./LoadMore";
import { InternalPanel } from "./InternalPanel";

function humanize(eventType: string): string {
  return eventType.replace(/[._]+/g, " ");
}

function payloadSummary(payload: AuditEvent["payload"]): string {
  if (payload === null) {
    return "";
  }
  return Object.entries(payload)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("; ");
}

/**
 * Change history for an object. Only editors and approvers may read it, so it is not
 * rendered for anyone else, and the list is fetched only when it is opened.
 */
export function AuditPanel({
  subjectType,
  subjectId,
}: {
  subjectType: AuditSubject;
  subjectId: string;
}) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const audit = useAudit(subjectType, subjectId, open && can.viewAudit(user));
  const names = useUserNames();

  if (!can.viewAudit(user)) {
    return null;
  }
  return (
    <InternalPanel title={t("audit.title")}>
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? t("audit.hide") : t("audit.show")}
      </Button>
      <div id={regionId}>
        {open ? (
          audit.isPending ? (
            <p role="status">{t("loading")}</p>
          ) : audit.isError ? (
            <EditorialError error={audit.error} />
          ) : audit.items.length === 0 ? (
            <p>{t("audit.empty")}</p>
          ) : (
            <>
              <ol className="audit-list">
                {audit.items.map((event) => (
                  <li key={event.id}>
                    <p>
                      <strong>{humanize(event.event_type)}</strong>
                      {event.actor_user_id ? ` — ${names(event.actor_user_id)}` : ""}
                    </p>
                    <p className="hint">
                      <time dateTime={event.created_at}>
                        {formatDate(locale, event.created_at)}
                      </time>
                      {payloadSummary(event.payload) ? ` · ${payloadSummary(event.payload)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
              <LoadMore
                hasMore={audit.hasNextPage}
                loading={audit.isFetchingNextPage}
                onLoadMore={() => void audit.fetchNextPage()}
              />
            </>
          )
        ) : null}
      </div>
    </InternalPanel>
  );
}
