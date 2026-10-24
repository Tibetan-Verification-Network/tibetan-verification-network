import type { InputHTMLAttributes, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TextField({
  id,
  label,
  hint,
  error,
  suffix,
  ...props
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  suffix?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      {suffix ? (
        <div className="input-control">
          <Input
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            {...props}
          />
          {suffix}
        </div>
      ) : (
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
      )}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
