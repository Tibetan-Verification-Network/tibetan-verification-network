import { ApiError } from "../api/types";
import { useI18n } from "../i18n/useI18n";

/** Marks fields the API rejected with 422. The summary text comes from `EditorialError`. */
export function useFieldError(error: unknown): (name: string) => string | undefined {
  const { t } = useI18n();
  return (name) =>
    error instanceof ApiError && name in error.fieldErrors ? t("editorial.error.field") : undefined;
}

export function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** A date input value as the UTC midnight the API stores, or null when empty. */
export function isoFromDateInput(value: string): string | null {
  return value === "" ? null : `${value}T00:00:00Z`;
}

/** Ids in a new order after moving one item up (-1) or down (+1). */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) {
    return null;
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return null;
  }
  next.splice(to, 0, moved);
  return next;
}
