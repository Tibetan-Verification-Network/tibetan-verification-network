import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { submitClaim } from "../api/submissions";
import { ApiError } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { DocumentTitle } from "../components/DocumentTitle";
import { ErrorSummary, type SummaryError } from "../components/ErrorSummary";
import { CheckboxField, TextAreaField } from "../components/Fields";
import { TextField } from "../components/TextField";
import { Turnstile } from "../components/Turnstile";
import { readTurnstileSiteKey } from "../config";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";
import { EMPTY, SERVER_FIELDS, validate, type FieldId, type Values } from "./submitValidation";

export function SubmitPage() {
  const { t } = useI18n();
  const { baseUrl } = useAuth();
  const siteKey = useMemo(() => readTurnstileSiteKey(), []);
  const [values, setValues] = useState<Values>(EMPTY);
  const [problems, setProblems] = useState<{ id: FieldId; message: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === "done") {
      successHeading.current?.focus();
    }
  }, [status]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function messageFor(id: FieldId): string | undefined {
    return problems.find((problem) => problem.id === id)?.message;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") {
      return;
    }
    setFormError(null);
    const found = validate(values, siteKey !== null, captchaToken).map((problem) => ({
      id: problem.id,
      message: t(problem.key),
    }));
    setProblems(found);
    if (found.length > 0) {
      return;
    }
    setStatus("sending");
    try {
      await submitClaim(baseUrl, { ...values, captchaToken });
      setValues(EMPTY);
      setStatus("done");
    } catch (error) {
      setStatus("idle");
      // A used Turnstile token cannot be replayed, so ask for a fresh one.
      setCaptchaToken(null);
      setCaptchaEpoch((epoch) => epoch + 1);
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const mapped = Object.keys(error.fieldErrors)
          .map((field) => SERVER_FIELDS[field])
          .filter((entry): entry is { id: FieldId; key: MessageKey } => entry !== undefined)
          .map((entry) => ({ id: entry.id, message: t(entry.key) }));
        if (mapped.length > 0) {
          setProblems(mapped);
          return;
        }
      }
      setFormError(t(error instanceof ApiError ? error.code : "errors.generic"));
    }
  }

  if (status === "done") {
    return (
      <>
        <DocumentTitle title={t("submit.success.title")} />
        <h1 ref={successHeading} tabIndex={-1}>
          {t("submit.success.title")}
        </h1>
        <Alert tone="success">{t("submit.success.body")}</Alert>
        <p>
          <Button
            variant="secondary"
            onClick={() => {
              setStatus("idle");
              setProblems([]);
              setCaptchaToken(null);
              setCaptchaEpoch((epoch) => epoch + 1);
            }}
          >
            {t("submit.success.another")}
          </Button>
        </p>
      </>
    );
  }

  const summary: SummaryError[] = [
    ...problems.map((problem) => ({
      id: problem.id === "submit-captcha" ? undefined : problem.id,
      message: problem.message,
    })),
    ...(formError === null ? [] : [{ message: formError }]),
  ];

  return (
    <>
      <DocumentTitle title={t("submit.title")} />
      <h1>{t("submit.title")}</h1>
      <p className="lede">{t("submit.lead")}</p>
      <Alert tone="info">{t("submit.noGuarantee")}</Alert>
      <ErrorSummary errors={summary} />

      <form className="form form-wide" noValidate onSubmit={(event) => void onSubmit(event)}>
        <TextAreaField
          id="submit-claim"
          label={t("submit.claim")}
          hint={t("submit.claimHint")}
          error={messageFor("submit-claim")}
          rows={6}
          required
          value={values.claimText}
          onChange={(event) => set("claimText", event.target.value)}
        />
        <TextAreaField
          id="submit-context"
          label={t("submit.context")}
          hint={t("submit.contextHint")}
          error={messageFor("submit-context")}
          rows={3}
          value={values.contextText}
          onChange={(event) => set("contextText", event.target.value)}
        />
        <TextField
          id="submit-source-url"
          label={t("submit.sourceUrl")}
          hint={t("submit.sourceUrlHint")}
          error={messageFor("submit-source-url")}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={values.sourceUrl}
          onChange={(event) => set("sourceUrl", event.target.value)}
        />

        <fieldset className="filters">
          <legend>{t("submit.contactTitle")}</legend>
          <p className="hint">{t("submit.contactHint")}</p>
          <TextField
            id="submit-name"
            label={t("submit.contactName")}
            autoComplete="name"
            value={values.contactName}
            onChange={(event) => set("contactName", event.target.value)}
          />
          <TextField
            id="submit-email"
            label={t("submit.contactEmail")}
            error={messageFor("submit-email")}
            type="email"
            autoComplete="email"
            value={values.contactEmail}
            onChange={(event) => set("contactEmail", event.target.value)}
          />
          <TextField
            id="submit-phone"
            label={t("submit.contactPhone")}
            type="tel"
            autoComplete="tel"
            value={values.contactPhone}
            onChange={(event) => set("contactPhone", event.target.value)}
          />
          <CheckboxField
            id="submit-consent"
            label={t("submit.consent")}
            error={messageFor("submit-consent")}
            checked={values.privacyConsent}
            onChange={(event) => set("privacyConsent", event.target.checked)}
          />
        </fieldset>

        <p className="privacy-notice">{t("submit.privacy")}</p>

        <div className="hp" aria-hidden="true">
          <label htmlFor="submit-website">Leave this field empty</label>
          <input
            id="submit-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(event) => set("website", event.target.value)}
          />
        </div>

        {siteKey !== null ? (
          <div className="field" role="group" aria-labelledby="submit-captcha-label">
            <p id="submit-captcha-label" className="label">
              {t("submit.captcha")}
            </p>
            <Turnstile key={captchaEpoch} siteKey={siteKey} onToken={setCaptchaToken} />
            {messageFor("submit-captcha") ? (
              <p className="field-error">{messageFor("submit-captcha")}</p>
            ) : null}
          </div>
        ) : null}

        <div className="button-row">
          <Button type="submit" disabled={status === "sending"}>
            {status === "sending" ? t("submit.sending") : t("submit.submit")}
          </Button>
        </div>
      </form>
    </>
  );
}
