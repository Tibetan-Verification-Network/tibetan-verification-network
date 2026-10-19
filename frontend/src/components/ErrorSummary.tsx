import { useEffect, useRef } from "react";

import { useI18n } from "../i18n/useI18n";

export interface SummaryError {
  id?: string;
  message: string;
}

export function ErrorSummary({ errors }: { errors: readonly SummaryError[] }) {
  const { t } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const signature = errors.map((error) => `${error.id ?? "form"}:${error.message}`).join("\n");

  useEffect(() => {
    if (signature === "") {
      return;
    }
    headingRef.current?.focus();
  }, [signature]);

  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="error-summary" role="alert">
      <h2 ref={headingRef} tabIndex={-1}>
        {t("errors.summary")}
      </h2>
      <ul>
        {errors.map((error) => (
          <li key={`${error.id ?? "form"}:${error.message}`}>
            {error.id === undefined ? (
              error.message
            ) : (
              <a
                href={`#${error.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(error.id ?? "")?.focus();
                }}
              >
                {error.message}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
