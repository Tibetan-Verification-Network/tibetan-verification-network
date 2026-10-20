import { useState } from "react";

import { useEditorialMutation } from "../../api/editorial/queries";
import type { Draft, DraftSourceRef, Source } from "../../api/editorial/types";
import { Button } from "../../components/Button";
import { TextAreaField } from "../../components/Fields";
import { useI18n } from "../../i18n/useI18n";
import { EditorialError } from "../components/EditorialError";
import { moveId } from "../formErrors";

interface Ref {
  source_id: string;
  relevance_note: string;
}

function refsFrom(sources: DraftSourceRef[]): Ref[] {
  return [...sources]
    .sort((a, b) => a.position - b.position)
    .map((source) => ({
      source_id: source.source_id,
      relevance_note: source.relevance_note ?? "",
    }));
}

/**
 * Which investigation sources the article cites, in reading order, with the one-line reason
 * each is relevant. The reasons are public, so they live with the public copy.
 */
export function SourceRefs({
  draft,
  sources,
  editable,
  onSaved,
}: {
  draft: Draft;
  sources: Source[];
  editable: boolean;
  onSaved: (draft: Draft) => void;
}) {
  const { t } = useI18n();
  const [refs, setRefs] = useState<Ref[]>(() => refsFrom(draft.sources));
  const [saved, setSaved] = useState<Ref[]>(refs);
  const title = (id: string) =>
    sources.find((source) => source.id === id)?.title ??
    t("factcheck.sources.unknown", { id: id.slice(0, 8) });

  const save = useEditorialMutation<Ref[], Draft>({
    success: "factcheck.sources.saved",
    mutationFn: (items, api) =>
      api.send<Draft>(
        "PUT",
        `/api/v1/editorial/factchecks/${draft.fact_check_id}/languages/${draft.language}/sources`,
        {
          items: items.map((item, position) => ({
            source_id: item.source_id,
            relevance_note: item.relevance_note.trim() === "" ? null : item.relevance_note.trim(),
            position,
          })),
        },
      ),
    onSuccess: (data, items) => {
      setSaved(items);
      onSaved(data);
    },
  });

  const dirty = JSON.stringify(refs) !== JSON.stringify(saved);
  const ids = refs.map((ref) => ref.source_id);
  const available = sources.filter((source) => !ids.includes(source.id));

  return (
    <section aria-labelledby="refs-heading" className="stack public-fieldset">
      <h3 id="refs-heading">{t("factcheck.sources.title")}</h3>
      <p className="public-label">{t("editorial.publicCopy")}</p>
      {refs.length === 0 ? <p>{t("factcheck.sources.none")}</p> : null}
      <ol className="record-list">
        {refs.map((ref, index) => (
          <li key={ref.source_id} className="card">
            <p className="card-title">{title(ref.source_id)}</p>
            {editable ? (
              <>
                <TextAreaField
                  id={`ref-note-${ref.source_id}`}
                  label={t("factcheck.sources.note")}
                  rows={2}
                  value={ref.relevance_note}
                  onChange={(event) =>
                    setRefs((current) =>
                      current.map((item) =>
                        item.source_id === ref.source_id
                          ? { ...item, relevance_note: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <div className="button-row">
                  <Button
                    variant="secondary"
                    disabled={index === 0}
                    aria-label={t("editorial.moveUpItem", { item: title(ref.source_id) })}
                    onClick={() => {
                      const next = moveId(ids, ref.source_id, -1);
                      if (next) {
                        setRefs(
                          next.map((id) => refs.find((item) => item.source_id === id) as Ref),
                        );
                      }
                    }}
                  >
                    {t("editorial.moveUp")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={index === refs.length - 1}
                    aria-label={t("editorial.moveDownItem", { item: title(ref.source_id) })}
                    onClick={() => {
                      const next = moveId(ids, ref.source_id, 1);
                      if (next) {
                        setRefs(
                          next.map((id) => refs.find((item) => item.source_id === id) as Ref),
                        );
                      }
                    }}
                  >
                    {t("editorial.moveDown")}
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={t("factcheck.sources.removeItem", { item: title(ref.source_id) })}
                    onClick={() => setRefs((current) => current.filter((item) => item !== ref))}
                  >
                    {t("factcheck.sources.remove")}
                  </Button>
                </div>
              </>
            ) : ref.relevance_note !== "" ? (
              <p>{ref.relevance_note}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {editable && available.length > 0 ? (
        <>
          <h4>{t("factcheck.sources.available")}</h4>
          <ul className="plain-list">
            {available.map((source) => (
              <li key={source.id} className="row-between">
                <span>{source.title}</span>
                <Button
                  variant="secondary"
                  aria-label={t("factcheck.sources.addItem", { item: source.title })}
                  onClick={() =>
                    setRefs((current) => [...current, { source_id: source.id, relevance_note: "" }])
                  }
                >
                  {t("factcheck.sources.add")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {editable ? (
        <>
          <EditorialError error={save.error} />
          <div className="button-row">
            <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(refs)}>
              {save.isPending ? t("editorial.working") : t("factcheck.sources.save")}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
