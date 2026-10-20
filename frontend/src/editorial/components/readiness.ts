import { en, type MessageKey } from "../../i18n/locales/en";

export function readinessLabel(
  t: (key: MessageKey, values?: Record<string, string>) => string,
  issue: string,
): string {
  const key = `readiness.${issue}`;
  // An issue code this build does not know yet is shown as the raw code.
  return key in en ? t(key as MessageKey) : issue;
}
