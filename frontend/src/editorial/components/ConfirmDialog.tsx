import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/useI18n";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ConfirmDialogProps {
  title: string;
  /** What will happen, in plain words. Always shown above the buttons. */
  consequence: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When set, the confirm button stays disabled until this exact text is typed. */
  typedConfirmation?: string;
  /** Extra inputs, such as a reason. Rendered inside the dialog form. */
  children?: ReactNode;
  confirmDisabled?: boolean;
  pending?: boolean;
  error?: ReactNode;
  wide?: boolean;
}

/**
 * A modal that traps focus, closes on Escape, returns focus to the control that opened it,
 * and makes the page behind it inert. Rendered only while it is open.
 */
export function ConfirmDialog({
  title,
  consequence,
  confirmLabel,
  onConfirm,
  onCancel,
  typedConfirmation,
  children,
  confirmDisabled = false,
  pending = false,
  error,
  wide = false,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const consequenceId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    dialogRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      opener?.focus();
    };
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!pending) {
        onCancel();
      }
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const typedOk = typedConfirmation === undefined || typed === typedConfirmation;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (typedOk && !confirmDisabled && !pending) {
      onConfirm();
    }
  }

  return createPortal(
    <div
      data-slot="dialog-overlay"
      className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/55 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={consequenceId}
        tabIndex={-1}
        data-slot="dialog"
        className={cn(
          "w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-border bg-background p-6 text-foreground shadow-lg focus:outline-none",
          wide ? "max-w-3xl" : "max-w-xl",
        )}
        onKeyDown={onKeyDown}
      >
        <form onSubmit={submit} className="dialog-form">
          <h2 id={titleId}>{title}</h2>
          <div id={consequenceId} className="dialog-consequence">
            {consequence}
          </div>
          {children}
          {typedConfirmation !== undefined ? (
            <TextField
              id={`${titleId}-typed`}
              label={t("dialog.typeToConfirm", { text: typedConfirmation })}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          ) : null}
          {error}
          <div className="button-row">
            <Button type="submit" disabled={!typedOk || confirmDisabled || pending}>
              {pending ? t("editorial.working") : confirmLabel}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={onCancel}>
              {t("dialog.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
