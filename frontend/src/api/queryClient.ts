import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./types";

const STALE_MS = 60_000;

/** Retry transient failures once; never retry a definite answer such as 404. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient(overrides: { retry?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_MS,
        refetchOnWindowFocus: false,
        retry: overrides.retry === false ? false : shouldRetry,
      },
    },
  });
}
