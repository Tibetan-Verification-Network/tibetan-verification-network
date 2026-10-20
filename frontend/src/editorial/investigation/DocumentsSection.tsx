import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useEditorialMutation } from "../../api/editorial/queries";
import type { ArchiveDocument } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { TextAreaField } from "../../components/Fields";
import { TextField } from "../../components/TextField";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { formatBytes, nullIfBlank } from "../text";

export function DocumentsSection({
  investigationId,
  documents,
  canUpload,
}: {
  investigationId: string;
  documents: ArchiveDocument[];
  canUpload: boolean;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [inputKey, setInputKey] = useState(0);

  const upload = useEditorialMutation<FormData, ArchiveDocument>({
    success: "archive.uploaded",
    mutationFn: (form, api) =>
      api.upload<ArchiveDocument>(`/api/v1/investigations/${investigationId}/documents`, form),
    onSuccess: () => {
      setFile(null);
      setTitle("");
      setDescription("");
      setInputKey((current) => current + 1);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (file === null) {
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("title", title.trim() === "" ? file.name : title.trim());
    const note = nullIfBlank(description);
    if (note !== null) {
      form.set("description", note);
    }
    upload.mutate(form);
  }

  return (
    <section aria-labelledby="documents-heading" className="stack">
      <h2 id="documents-heading">{t("archive.title")}</h2>
      {documents.length === 0 ? <p>{t("archive.none")}</p> : null}
      <ul className="card-list">
        {documents.map((document) => (
          <li key={document.id} className="card">
            <h3 className="card-title">
              <Link to={`/editorial/archive/${document.id}`}>{document.title}</Link>
            </h3>
            <p className="card-meta">
              <span>{t(`archive.visibility.${document.visibility}`)}</span>
              <span>{t(`archive.upload.${document.upload_status}`)}</span>
              {document.byte_size !== null ? <span>{formatBytes(document.byte_size)}</span> : null}
            </p>
          </li>
        ))}
      </ul>
      {canUpload ? (
        <form className="stack form-wide" onSubmit={submit}>
          <h3>{t("archive.uploadTitle")}</h3>
          <p className="hint">{t("archive.uploadHint")}</p>
          <div className="field">
            <label htmlFor="archive-file">{t("archive.file")}</label>
            <input
              key={inputKey}
              id="archive-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <TextField
            id="archive-title"
            label={t("archive.docTitle")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextAreaField
            id="archive-description"
            label={t("archive.description")}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <EditorialError error={upload.error} />
          <div className="button-row">
            <Button type="submit" disabled={file === null || upload.isPending}>
              {upload.isPending ? t("editorial.working") : t("archive.upload")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
