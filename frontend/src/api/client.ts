import { ApiError, type ApiErrorCode } from "./types";

const CSRF_HEADER = "X-CSRF-Token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set(["/api/v1/auth/login", "/api/v1/auth/activate"]);

let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function resetApiState(): void {
  csrfToken = null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function passwordLength(detail: string): string | null {
  const match = /^Password must be at least (\d+) characters$/.exec(detail);
  return match?.[1] ?? null;
}

function fieldErrorsFrom(detail: unknown): Record<string, ApiErrorCode> {
  if (!Array.isArray(detail)) {
    return {};
  }
  const errors: Record<string, ApiErrorCode> = {};
  for (const item of detail) {
    if (typeof item !== "object" || item === null || !("loc" in item)) {
      continue;
    }
    const loc = item.loc;
    if (!Array.isArray(loc)) {
      continue;
    }
    const field = loc[loc.length - 1];
    if (typeof field === "string" && field !== "body") {
      errors[field] = "errors.generic";
    }
  }
  return errors;
}

function errorFromPayload(status: number, payload: unknown): ApiError {
  const detail =
    typeof payload === "object" && payload !== null && "detail" in payload
      ? payload.detail
      : undefined;
  if (typeof detail === "string") {
    if (detail === "Invalid email or password.") {
      return new ApiError(status, "login.invalid");
    }
    if (detail === "CSRF validation failed.") {
      return new ApiError(status, "errors.csrf");
    }
    if (detail === "Authentication required") {
      return new ApiError(status, "errors.authRequired");
    }
    if (detail === "Invalid or expired invite") {
      return new ApiError(status, "activate.invalid");
    }
    if (detail === "Forbidden.") {
      return new ApiError(status, "errors.forbidden");
    }
    if (detail === "Origin validation failed.") {
      return new ApiError(status, "errors.origin");
    }
    const count = passwordLength(detail);
    if (count !== null) {
      return new ApiError(
        status,
        "activate.passwordLength",
        { password: "activate.passwordLength" },
        { count },
      );
    }
  }
  if (status === 401) {
    return new ApiError(status, "errors.authRequired");
  }
  if (status === 403) {
    return new ApiError(status, "errors.forbidden");
  }
  if (status === 400 || status === 422) {
    return new ApiError(status, "errors.generic", fieldErrorsFrom(detail));
  }
  return new ApiError(status, "errors.generic");
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (MUTATING_METHODS.has(method) && !CSRF_EXEMPT_PATHS.has(path) && csrfToken !== null) {
    headers.set(CSRF_HEADER, csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, `${baseUrl}/`), {
      method,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
    throw new ApiError(0, "errors.network");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text !== "") {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    throw errorFromPayload(response.status, payload);
  }
  return payload as T;
}
