import { useState } from "react";

import { useVersion, useVersions } from "../../api/editorial/queries";
import type { Locale } from "../../i18n/translate";
import { Button } from "../../components/Button";
import { formatDate } from "../../i18n/format";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { QueryBoundary } from "../components/QueryBoundary";
import { SnapshotPreview } from "./SnapshotPreview";

function VersionDetailView({
  id,
  language,
  number,
}: {
  id: string;
  language: Locale;
  number: number;
}) {
  const version = useVersion(id, language, number);
  return (
    <QueryBoundary query={version}>
      {(data) => <SnapshotPreview snapshot={data.snapshot} />}
    </QueryBoundary>
  );
}

/** Every published version of this language, with proof that what is stored still matches its checksum. */
export function VersionsPanel({ id, language }: { id: string; language: Locale }) {
  const { t, locale } = useI18n();
  const versions = useVersions(id, language);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section aria-labelledby="versions-heading" className="stack">
      <h2 id="versions-heading">{t("version.title")}</h2>
      {versions.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : versions.isError ? (
        <EditorialError error={versions.error} />
      ) : versions.data.items.length === 0 ? (
        <p>{t("version.none")}</p>
      ) : (
        <ol className="record-list">
          {versions.data.items.map((version) => (
            <li key={version.version_number} className="card">
              <p className="badge-row">
                <span className="status-badge">
                  {t("version.number", { number: String(version.version_number) })}
                </span>
                <span className="status-badge">{t(`article.kind.${version.kind}`)}</span>
                <span
                  className={`status-badge ${version.checksum_valid ? "status-published" : "status-rejected"}`}
                >
                  {version.checksum_valid ? t("version.checksumOk") : t("version.checksumBad")}
                </span>
              </p>
              <p className="hint">
                <time dateTime={version.published_at}>
                  {formatDate(locale, version.published_at)}
                </time>{" "}
                ·{" "}
                <code title={version.content_checksum}>
                  {version.content_checksum.slice(0, 16)}…
                </code>
              </p>
              <div className="button-row">
                <Button
                  variant="secondary"
                  aria-expanded={open === version.version_number}
                  onClick={() =>
                    setOpen(open === version.version_number ? null : version.version_number)
                  }
                >
                  {open === version.version_number ? t("version.hide") : t("version.view")}
                </Button>
              </div>
              {open === version.version_number ? (
                <VersionDetailView id={id} language={language} number={version.version_number} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
