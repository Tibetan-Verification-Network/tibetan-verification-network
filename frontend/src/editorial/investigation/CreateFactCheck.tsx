import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useEditorialMutation } from "../../api/editorial/queries";
import { Button } from "../../components/Button";
import { CheckboxField } from "../../components/Fields";
import type { Locale } from "../../i18n/translate";
import { useI18n } from "../../i18n/useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorialError } from "../components/EditorialError";

interface Created {
  id: string;
}

/** Starts the fact-check for an investigation, with one draft per chosen language. */
export function CreateFactCheck({ investigationId }: { investigationId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [languages, setLanguages] = useState<Record<Locale, boolean>>({ bo: true, en: true });

  const chosen = (Object.keys(languages) as Locale[]).filter((language) => languages[language]);

  const create = useEditorialMutation<Locale[], Created>({
    success: "factcheck.created",
    mutationFn: (selected, api) =>
      api.send<Created>("POST", `/api/v1/investigations/${investigationId}/factcheck`, {
        languages: selected,
      }),
    onSuccess: (data) => {
      setOpen(false);
      void navigate(`/editorial/factchecks/${data.id}`);
    },
  });

  return (
    <section aria-labelledby="create-factcheck-heading" className="stack">
      <h2 id="create-factcheck-heading">{t("factcheck.create.title")}</h2>
      <p>{t("factcheck.create.lead")}</p>
      <div className="button-row">
        <Button onClick={() => setOpen(true)}>{t("factcheck.create.button")}</Button>
      </div>
      {open ? (
        <ConfirmDialog
          title={t("factcheck.create.button")}
          consequence={t("factcheck.create.consequence")}
          confirmLabel={t("factcheck.create.button")}
          confirmDisabled={chosen.length === 0}
          pending={create.isPending}
          error={<EditorialError error={create.error} />}
          onCancel={() => {
            create.reset();
            setOpen(false);
          }}
          onConfirm={() => create.mutate(chosen)}
        >
          <fieldset className="plain-fieldset">
            <legend>{t("factcheck.create.languages")}</legend>
            {(["bo", "en"] as const).map((language) => (
              <CheckboxField
                key={language}
                id={`create-language-${language}`}
                label={t(`language.${language}`)}
                checked={languages[language]}
                onChange={(event) =>
                  setLanguages((current) => ({ ...current, [language]: event.target.checked }))
                }
              />
            ))}
          </fieldset>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
