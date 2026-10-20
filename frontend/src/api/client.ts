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

function structuredDetail(detail: unknown): {
  code?: string;
  message?: string;
  issues?: readonly string[];
} {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return {};
  }
  const result: { code?: string; message?: string; issues?: readonly string[] } = {};
  if ("code" in detail && typeof detail.code === "string") {
    result.code = detail.code;
  }
  if ("message" in detail && typeof detail.message === "string") {
    result.message = detail.message;
  }
  if ("issues" in detail && Array.isArray(detail.issues)) {
    result.issues = detail.issues.filter((issue): issue is string => typeof issue === "string");
  }
  return result;
}

function errorFromPayload(status: number, payload: unknown): ApiError {
  const detail =
    typeof payload === "object" && payload !== null && "detail" in payload
      ? payload.detail
      : undefined;
  const info = structuredDetail(detail);
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
  if (status === 404) {
    return new ApiError(status, "errors.notFound", {}, {}, info);
  }
  if (status === 409) {
    return new ApiError(status, "errors.conflict", {}, {}, info);
  }
  if (status === 400 || status === 422) {
    return new ApiError(status, "errors.validation", fieldErrorsFrom(detail), {}, info);
  }
  return new ApiError(status, "errors.generic", {}, {}, info);
}

export interface ApiRequestOptions {
  method?: string;
  /** A plain object is sent as JSON. A `FormData` is sent as multipart, for archive uploads. */
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * A session has one CSRF token and every tab that loads asks for a new one, so a second tab makes
 * the first tab's token stale. The server rejects a stale token before it runs anything, which
 * makes one retry with a fresh token safe.
 */
async function refreshCsrfToken(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const payload = await apiRequest<unknown>(baseUrl, "/api/v1/auth/csrf", { signal });
    if (
      typeof payload === "object" &&
      payload !== null &&
      "csrf_token" in payload &&
      typeof payload.csrf_token === "string"
    ) {
      csrfToken = payload.csrf_token;
      return true;
    }
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
  }
  return false;
}

export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  try {
    return await sendRequest<T>(baseUrl, path, options);
  } catch (error) {
    const method = (options.method ?? "GET").toUpperCase();
    if (
      error instanceof ApiError &&
      error.code === "errors.csrf" &&
      MUTATING_METHODS.has(method) &&
      csrfToken !== null &&
      (await refreshCsrfToken(baseUrl, options.signal))
    ) {
      return sendRequest<T>(baseUrl, path, options);
    }
    throw error;
  }
}

async function sendRequest<T>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers({ Accept: "application/json" });
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) {
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
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
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
