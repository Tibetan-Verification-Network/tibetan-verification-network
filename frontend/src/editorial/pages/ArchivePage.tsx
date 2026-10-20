import { Link } from "react-router-dom";

import { useArchiveDocuments } from "../../api/editorial/queries";
import { DocumentTitle } from "../../components/DocumentTitle";
import { LoadingState } from "../../components/LoadingState";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { LoadMore } from "../components/LoadMore";
import { formatBytes } from "../text";

export function ArchivePage() {
  const { t } = useI18n();
  const documents = useArchiveDocuments();
  return (
    <>
      <DocumentTitle title={t("nav.archive")} />
      <h1>{t("nav.archive")}</h1>
      <p className="lede">{t("archive.lead")}</p>
      {documents.isPending ? (
        <LoadingState />
      ) : documents.isError ? (
        <EditorialError error={documents.error} />
      ) : documents.items.length === 0 ? (
        <p>{t("archive.none")}</p>
      ) : (
        <>
          <ul className="card-list">
            {documents.items.map((document) => (
              <li key={document.id} className="card">
                <h2 className="card-title">
                  <Link to={`/editorial/archive/${document.id}`}>{document.title}</Link>
                </h2>
                <p className="card-meta">
                  <span>{t(`archive.visibility.${document.visibility}`)}</span>
                  <span>{t(`archive.upload.${document.upload_status}`)}</span>
                  {document.byte_size !== null ? (
                    <span>{formatBytes(document.byte_size)}</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={documents.hasNextPage}
            loading={documents.isFetchingNextPage}
            onLoadMore={() => void documents.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
