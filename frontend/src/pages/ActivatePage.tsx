import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { activateInvite } from "../api/auth";
import { ApiError } from "../api/types";
import { PASSWORD_MIN_LENGTH } from "../config";
import { currentInviteToken, forgetInviteToken, rememberInviteToken } from "../auth/inviteMemory";
import { useAuth } from "../auth/useAuth";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { DocumentTitle } from "../components/DocumentTitle";
import { ErrorSummary, type SummaryError } from "../components/ErrorSummary";
import { TextField } from "../components/TextField";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";

interface FieldIssue {
  id: string;
  code: MessageKey;
  values?: Record<string, string>;
}

export function ActivatePage() {
  const { t } = useI18n();
  const { baseUrl } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token") ?? "";
  const [tokenDraft, setTokenDraft] = useState<string | null>(null);
  const token = tokenDraft ?? (tokenFromUrl || currentInviteToken());
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tokenFromUrl === "") {
      return;
    }
    rememberInviteToken(tokenFromUrl);
    navigate("/activate", { replace: true });
  }, [navigate, tokenFromUrl]);

  const summary: SummaryError[] = [
    ...(formError === null ? [] : [{ message: t(formError, formValues) }]),
    ...issues.map((issue) => ({ id: issue.id, message: t(issue.code, issue.values) })),
  ];

  function fieldError(id: string): string | undefined {
    const issue = issues.find((item) => item.id === id);
    return issue === undefined ? undefined : t(issue.code, issue.values);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextIssues: FieldIssue[] = [];
    if (token.trim() === "") {
      nextIssues.push({
        id: "invite-token",
        code: "errors.enter",
        values: { field: t("activate.token") },
      });
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      nextIssues.push({
        id: "new-password",
        code: "activate.passwordLength",
        values: { count: String(PASSWORD_MIN_LENGTH) },
      });
    }
    if (password !== confirm) {
      nextIssues.push({ id: "confirm-password", code: "activate.mismatch" });
    }
    setIssues(nextIssues);
    setFormError(null);
    if (nextIssues.length > 0) {
      return;
    }

    setPending(true);
    try {
      await activateInvite(baseUrl, { token: token.trim(), password, displayName });
      forgetInviteToken();
      setTokenDraft("");
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.code);
        setFormValues(error.values);
        if (error.code === "activate.invalid") {
          setIssues([]);
        } else if (error.fieldErrors.password === "activate.passwordLength") {
          setIssues([
            { id: "new-password", code: "activate.passwordLength", values: error.values },
          ]);
        } else if (error.fieldErrors.token) {
          setIssues([
            { id: "invite-token", code: "errors.check", values: { field: t("activate.token") } },
          ]);
        }
      } else {
        setFormError("errors.generic");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DocumentTitle title={t("activate.title")} />
      <div className="auth-panel">
        <h1>{t("activate.title")}</h1>
        <p className="lede">{t("activate.lead")}</p>
        {done ? (
          <Alert tone="success">
            <p>{t("activate.success")}</p>
            <p>
              <Link to="/login">{t("activate.loginLink")}</Link>
            </p>
          </Alert>
        ) : (
          <>
            <ErrorSummary errors={summary} />
            <form
              className="form"
              noValidate
              onSubmit={(event) => void onSubmit(event)}
              aria-busy={pending}
            >
              <TextField
                id="invite-token"
                label={t("activate.token")}
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={512}
                value={token}
                error={fieldError("invite-token")}
                onChange={(event) => setTokenDraft(event.target.value)}
              />
              <TextField
                id="display-name"
                label={t("activate.displayName")}
                hint={t("activate.displayNameHint")}
                autoComplete="name"
                maxLength={200}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <TextField
                id="new-password"
                label={t("activate.password")}
                type="password"
                autoComplete="new-password"
                required
                maxLength={256}
                value={password}
                error={fieldError("new-password")}
                onChange={(event) => setPassword(event.target.value)}
              />
              <TextField
                id="confirm-password"
                label={t("activate.confirm")}
                type="password"
                autoComplete="new-password"
                required
                maxLength={256}
                value={confirm}
                error={fieldError("confirm-password")}
                onChange={(event) => setConfirm(event.target.value)}
              />
              <Button type="submit" disabled={pending}>
                {t("activate.submit")}
              </Button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
