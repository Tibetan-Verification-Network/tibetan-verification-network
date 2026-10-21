import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { fetchCurrentUser, login } from "../api/auth";
import { setCsrfToken } from "../api/client";
import { ApiError } from "../api/types";
import { PASSWORD_MIN_LENGTH } from "../config";
import { editorialReturnPath } from "../auth/returnPath";
import { useAuth } from "../auth/useAuth";
import { DocumentTitle } from "../components/DocumentTitle";
import { ErrorSummary, type SummaryError } from "../components/ErrorSummary";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";

interface FieldIssue {
  id: string;
  code: MessageKey;
  values?: Record<string, string>;
}

export function LoginPage() {
  const { t } = useI18n();
  const { baseUrl, status, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = editorialReturnPath(readFrom(location.state));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo, status]);

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
    if (email.trim() === "") {
      nextIssues.push({ id: "email", code: "errors.enter", values: { field: t("login.email") } });
    }
    if (password === "") {
      nextIssues.push({
        id: "password",
        code: "errors.enter",
        values: { field: t("login.password") },
      });
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      nextIssues.push({
        id: "password",
        code: "activate.passwordLength",
        values: { count: String(PASSWORD_MIN_LENGTH) },
      });
    }
    setIssues(nextIssues);
    setFormError(null);
    if (nextIssues.length > 0) {
      return;
    }

    setPending(true);
    try {
      await login(baseUrl, email.trim(), password);
      const user = await fetchCurrentUser(baseUrl);
      if (user === null) {
        setCsrfToken(null);
        setFormError("errors.generic");
        return;
      }
      setUser(user);
      navigate(returnTo, { replace: true });
    } catch (error) {
      applyRequestError(error, setFormError, setFormValues, setIssues, {
        email: t("login.email"),
        password: t("login.password"),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DocumentTitle title={t("login.title")} />
      <h1>{t("login.title")}</h1>
      <p>{t("login.lead")}</p>
      <ErrorSummary errors={summary} />
      <form
        className="form"
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        aria-busy={pending}
      >
        <TextField
          id="email"
          label={t("login.email")}
          type="email"
          autoComplete="username"
          required
          maxLength={320}
          value={email}
          error={fieldError("email")}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          id="password"
          label={t("login.password")}
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          value={password}
          error={fieldError("password")}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" disabled={pending}>
          {t("login.submit")}
        </Button>
      </form>
      <p>
        {t("login.activatePrompt")} <Link to="/activate">{t("login.activateLink")}</Link>
      </p>
    </>
  );
}

function readFrom(state: unknown): unknown {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return undefined;
  }
  return state.from;
}

function applyRequestError(
  error: unknown,
  setFormError: (code: MessageKey | null) => void,
  setFormValues: (values: Record<string, string>) => void,
  setIssues: (issues: FieldIssue[]) => void,
  labels: { email: string; password: string },
) {
  if (!(error instanceof ApiError)) {
    setFormError("errors.generic");
    return;
  }
  setFormError(error.code);
  setFormValues(error.values);
  if (error.fieldErrors.password === "activate.passwordLength") {
    setIssues([{ id: "password", code: "activate.passwordLength", values: error.values }]);
    return;
  }
  const nextIssues: FieldIssue[] = [];
  if (error.fieldErrors.email) {
    nextIssues.push({ id: "email", code: "errors.check", values: { field: labels.email } });
  }
  if (error.fieldErrors.password) {
    nextIssues.push({ id: "password", code: "errors.check", values: { field: labels.password } });
  }
  setIssues(nextIssues);
}
