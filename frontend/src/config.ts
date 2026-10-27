const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Returns the API origin. The value "/" means the API is served from the site's own origin
 * (for example on Vercel, where `/api/*` is routed to the backend service).
 */
export function readApiBaseUrl(
  value: string | undefined = import.meta.env.VITE_API_BASE_URL,
  pageOrigin: string = globalThis.location?.origin ?? "",
): string {
  if (value === undefined || value.trim() === "") {
    throw new ConfigurationError("API base URL is not configured");
  }
  if (value.trim() === "/") {
    value = pageOrigin;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError("API base URL must be an http(s) URL");
  }

  if (!HTTP_PROTOCOLS.has(url.protocol) || url.origin === "null") {
    throw new ConfigurationError("API base URL must be an http(s) URL");
  }
  if (url.username !== "" || url.password !== "") {
    throw new ConfigurationError("API base URL must not include credentials");
  }
  return url.origin;
}

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const DEFAULT_PASSWORD_MIN_LENGTH = 12;

/** Matches backend `password_min_length` (from `PASSWORD_MIN_LENGTH` / `VITE_PASSWORD_MIN_LENGTH`). */
export function readPasswordMinLength(
  value: string | undefined = import.meta.env.VITE_PASSWORD_MIN_LENGTH,
): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PASSWORD_MIN_LENGTH;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PASSWORD_MIN_LENGTH;
  }
  return Math.min(PASSWORD_MAX, Math.max(PASSWORD_MIN, parsed));
}

export const PASSWORD_MIN_LENGTH = readPasswordMinLength();

const TURNSTILE_SITE_KEY = /^[0-9A-Za-z_-]{8,100}$/;

/** The Turnstile widget is shown only when a site key is configured. */
export function readTurnstileSiteKey(
  value: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY,
): string | null {
  const trimmed = value?.trim() ?? "";
  return TURNSTILE_SITE_KEY.test(trimmed) ? trimmed : null;
}
