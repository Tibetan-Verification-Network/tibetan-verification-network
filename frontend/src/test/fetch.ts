import { vi } from "vitest";

export function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.href;
  }
  if (typeof input === "string") {
    return input;
  }
  return input.url;
}

export interface RouteResult {
  status: number;
  body?: unknown;
}

export function installFetch(
  handler: (url: string, init: RequestInit) => RouteResult | Promise<RouteResult>,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = await handler(requestUrl(input), init ?? {});
    if (result.status === 204) {
      return new Response(null, { status: 204 });
    }
    return Response.json(result.body ?? {}, { status: result.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function installAnonymousApi() {
  return installFetch((url) => {
    if (url.endsWith("/ready")) {
      return { status: 200, body: { status: "ready" } };
    }
    if (url.endsWith("/api/v1/me")) {
      return { status: 401, body: { detail: "Authentication required" } };
    }
    throw new Error(`Unhandled fetch ${url}`);
  });
}
