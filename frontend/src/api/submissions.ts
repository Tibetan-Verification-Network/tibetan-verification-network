import { apiRequest } from "./client";

export interface SubmissionInput {
  claimText: string;
  contextText: string;
  sourceUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  privacyConsent: boolean;
  website: string;
  captchaToken: string | null;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function buildSubmissionBody(input: SubmissionInput): Record<string, unknown> {
  const name = optional(input.contactName);
  const email = optional(input.contactEmail);
  const phone = optional(input.contactPhone);
  const hasContact = name !== undefined || email !== undefined || phone !== undefined;
  return {
    claim_text: input.claimText.trim(),
    context_text: optional(input.contextText),
    source_url: optional(input.sourceUrl),
    contact: hasContact ? { name, email, phone } : undefined,
    privacy_consent: input.privacyConsent,
    website: input.website,
    captcha_token: input.captchaToken ?? undefined,
  };
}

/** The receipt is deliberately discarded: the success page reveals no identifiers. */
export async function submitClaim(
  baseUrl: string,
  input: SubmissionInput,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest<unknown>(baseUrl, "/api/v1/submissions", {
    method: "POST",
    body: buildSubmissionBody(input),
    signal,
  });
}
