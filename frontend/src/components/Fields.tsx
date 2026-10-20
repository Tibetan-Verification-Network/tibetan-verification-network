import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

function describedBy(id: string, hint: ReactNode, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldFrame({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  ...props
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  options,
  ...props
}: {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckboxField({
  id,
  label,
  error,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <div className="field field-checkbox">
      <div className="checkbox-row">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
