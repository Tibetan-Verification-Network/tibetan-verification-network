import type { MessageKey } from "../i18n/locales/en";

const CLAIM_MIN = 10;
const TEXT_MAX = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Values {
  claimText: string;
  contextText: string;
  sourceUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  privacyConsent: boolean;
  website: string;
}

export const EMPTY: Values = {
  claimText: "",
  contextText: "",
  sourceUrl: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  privacyConsent: false,
  website: "",
};

export type FieldId =
  | "submit-claim"
  | "submit-context"
  | "submit-source-url"
  | "submit-email"
  | "submit-consent"
  | "submit-captcha";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validate(
  values: Values,
  captchaRequired: boolean,
  captchaToken: string | null,
): { id: FieldId; key: MessageKey }[] {
  const problems: { id: FieldId; key: MessageKey }[] = [];
  const claim = values.claimText.trim();
  if (claim.length < CLAIM_MIN) {
    problems.push({ id: "submit-claim", key: "submit.error.claim" });
  } else if (claim.length > TEXT_MAX) {
    problems.push({ id: "submit-claim", key: "submit.error.claimLong" });
  }
  if (values.contextText.trim().length > TEXT_MAX) {
    problems.push({ id: "submit-context", key: "submit.error.contextLong" });
  }
  const url = values.sourceUrl.trim();
  if (url !== "" && !isHttpUrl(url)) {
    problems.push({ id: "submit-source-url", key: "submit.error.url" });
  }
  const email = values.contactEmail.trim();
  if (email !== "" && !EMAIL_PATTERN.test(email)) {
    problems.push({ id: "submit-email", key: "submit.error.email" });
  }
  const hasContact = [values.contactName, values.contactEmail, values.contactPhone].some(
    (value) => value.trim() !== "",
  );
  if (hasContact && !values.privacyConsent) {
    problems.push({ id: "submit-consent", key: "submit.error.consent" });
  }
  if (captchaRequired && captchaToken === null) {
    problems.push({ id: "submit-captcha", key: "submit.error.captcha" });
  }
  return problems;
}

export const SERVER_FIELDS: Record<string, { id: FieldId; key: MessageKey }> = {
  claim_text: { id: "submit-claim", key: "submit.error.claim" },
  context_text: { id: "submit-context", key: "submit.error.contextLong" },
  source_url: { id: "submit-source-url", key: "submit.error.url" },
  email: { id: "submit-email", key: "submit.error.email" },
  privacy_consent: { id: "submit-consent", key: "submit.error.consent" },
};
