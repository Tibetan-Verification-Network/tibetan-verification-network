import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { fetchCurrentUser, login } from "../api/auth";
import { setCsrfToken } from "../api/client";
import { ApiError } from "../api/types";
import { PASSWORD_MIN_LENGTH } from "../config";
import { editorialReturnPath } from "../auth/returnPath";
import { useAuth } from "../auth/useAuth";
import { DocumentTitle } from "../components/DocumentTitle";
import { ErrorSummary, type SummaryError } from "../components/ErrorSummary";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";

gsap.registerPlugin(useGSAP);

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
  const [showPassword, setShowPassword] = useState(false);

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

  const slogan = [t("login.slogan.1"), t("login.slogan.2"), t("login.slogan.3")] as const;

  return (
    <>
      <DocumentTitle title={t("login.title")} />
      <div className="login-screen">
        <aside className="login-aside" aria-label={slogan.join(" ")}>
          <LoginSlogan lines={slogan} />
        </aside>
        <div className="auth-panel">
          <h1>{t("login.title")}</h1>
          <p className="lede">{t("login.lead")}</p>
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
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              error={fieldError("password")}
              onChange={(event) => setPassword(event.target.value)}
              suffix={
                <button
                  type="button"
                  className="field-suffix"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
            />
            <Button type="submit" disabled={pending}>
              {t("login.submit")}
            </Button>
          </form>
          <p className="form-note">
            {t("login.activatePrompt")} <Link to="/activate">{t("login.activateLink")}</Link>
          </p>
        </div>
      </div>
    </>
  );
}

function LoginSlogan({ lines }: { lines: readonly string[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const caretRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const ruleRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const motion = gsap.matchMedia();

      motion.add("(prefers-reduced-motion: reduce)", () => {
        lines.forEach((line, index) => {
          const node = textRefs.current[index];
          if (node) node.textContent = line;
        });
        gsap.set(caretRefs.current, { autoAlpha: 0 });
        if (ruleRef.current) {
          gsap.set(ruleRef.current, { scaleX: 1, transformOrigin: "left center" });
        }
      });

      motion.add("(prefers-reduced-motion: no-preference)", () => {
        const root = rootRef.current;
        const rule = ruleRef.current;
        const texts = textRefs.current.filter((node): node is HTMLSpanElement => node !== null);
        const carets = caretRefs.current.filter((node): node is HTMLSpanElement => node !== null);
        if (!root || !rule || texts.length !== lines.length || carets.length !== lines.length) return;

        texts.forEach((node) => {
          node.textContent = "";
        });
        gsap.set(carets, { autoAlpha: 0 });
        gsap.set(rule, { scaleX: 0, transformOrigin: "left center" });

        const blinks = carets.map((caret) =>
          gsap.fromTo(
            caret,
            { opacity: 1 },
            {
              opacity: 0,
              duration: 0.48,
              repeat: -1,
              yoyo: true,
              ease: "none",
              paused: true,
              immediateRender: false,
            },
          ),
        );
        const showCaret = (index: number) => {
          blinks.forEach((tween, caretIndex) => {
            tween.pause(0);
            gsap.set(carets[caretIndex], { autoAlpha: caretIndex === index ? 1 : 0 });
            if (caretIndex === index) tween.play();
          });
        };

        const timeline = gsap.timeline({ repeat: -1 });
        timeline.fromTo(
          root,
          { autoAlpha: 0, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.55, ease: "power2.out" },
        );
        lines.forEach((line, index) => {
          const units = [...line];
          const counter = { count: 0 };
          timeline.call(() => showCaret(index));
          timeline.to(counter, {
            count: units.length,
            duration: Math.max(units.length * 0.048, 0.55),
            ease: "none",
            onUpdate: () => {
              const node = texts[index];
              if (node) node.textContent = units.slice(0, Math.round(counter.count)).join("");
            },
          });
          timeline.to({}, { duration: 0.28 });
        });
        timeline.call(() => showCaret(-1));
        timeline.to(rule, { scaleX: 1, duration: 0.5, ease: "power2.out" });
        timeline.to({}, { duration: 1.8 });
        timeline.to(root, { autoAlpha: 0, y: -10, duration: 0.45, ease: "power1.in" });
        timeline.set(root, { y: 0 });
        timeline.call(() => {
          texts.forEach((node) => {
            node.textContent = "";
          });
          gsap.set(rule, { scaleX: 0 });
        });
      });

      return () => motion.revert();
    },
    { scope: rootRef, dependencies: [lines.join("\n")], revertOnUpdate: true },
  );

  return (
    <div className="login-slogan" ref={rootRef} aria-hidden="true">
      {lines.map((line, index) => (
        <p className="login-slogan-line" key={line}>
          <span
            ref={(node) => {
              textRefs.current[index] = node;
            }}
          >
            {line}
          </span>
          <span
            className="login-slogan-caret"
            ref={(node) => {
              caretRefs.current[index] = node;
            }}
          />
        </p>
      ))}
      <span className="login-slogan-rule" ref={ruleRef} />
    </div>
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
