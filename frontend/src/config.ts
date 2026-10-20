const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function readApiBaseUrl(
  value: string | undefined = import.meta.env.VITE_API_BASE_URL,
): string {
  if (value === undefined || value.trim() === "") {
    throw new ConfigurationError("API base URL is not configured");
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

const TURNSTILE_SITE_KEY = /^[0-9A-Za-z_-]{8,100}$/;

/** The Turnstile widget is shown only when a site key is configured. */
export function readTurnstileSiteKey(
  value: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY,
): string | null {
  const trimmed = value?.trim() ?? "";
  return TURNSTILE_SITE_KEY.test(trimmed) ? trimmed : null;
}
