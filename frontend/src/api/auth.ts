import { apiRequest, setCsrfToken } from "./client";
import { ApiError, parseCurrentUser, type CurrentUser } from "./types";

interface CsrfPayload {
  csrf_token: string;
}

function isCsrfPayload(value: unknown): value is CsrfPayload {
  if (typeof value !== "object" || value === null || !("csrf_token" in value)) {
    return false;
  }
  return typeof value.csrf_token === "string" && value.csrf_token !== "";
}

export async function fetchCurrentUser(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<CurrentUser | null> {
  try {
    const body = await apiRequest<unknown>(baseUrl, "/api/v1/me", { signal });
    return parseCurrentUser(body);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function bootstrapSession(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<CurrentUser | null> {
  try {
    const user = await fetchCurrentUser(baseUrl, signal);
    if (user === null) {
      setCsrfToken(null);
      return null;
    }
    try {
      const csrf = await apiRequest<unknown>(baseUrl, "/api/v1/auth/csrf", { signal });
      if (!isCsrfPayload(csrf)) {
        setCsrfToken(null);
        return user;
      }
      setCsrfToken(csrf.csrf_token);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      setCsrfToken(null);
    }
    return user;
  } catch (error) {
    setCsrfToken(null);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

export async function login(baseUrl: string, email: string, password: string): Promise<void> {
  const body = await apiRequest<unknown>(baseUrl, "/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!isCsrfPayload(body)) {
    setCsrfToken(null);
    throw new ApiError(500, "errors.generic");
  }
  setCsrfToken(body.csrf_token);
}

export async function logout(baseUrl: string): Promise<void> {
  await apiRequest<void>(baseUrl, "/api/v1/auth/logout", { method: "POST" });
  setCsrfToken(null);
}

export async function activateInvite(
  baseUrl: string,
  input: { token: string; password: string; displayName: string },
): Promise<void> {
  const body: { token: string; password: string; display_name?: string } = {
    token: input.token,
    password: input.password,
  };
  const displayName = input.displayName.trim();
  if (displayName !== "") {
    body.display_name = displayName;
  }
  await apiRequest<unknown>(baseUrl, "/api/v1/auth/activate", { method: "POST", body });
}

export async function loadEditorialProbe(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  const body = await apiRequest<unknown>(baseUrl, "/api/v1/editorial/status", { signal });
  return typeof body === "object" && body !== null && "status" in body && body.status === "ok";
}
