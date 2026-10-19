import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { bootstrapSession } from "../api/auth";
import { setCsrfToken } from "../api/client";
import type { CurrentUser } from "../api/types";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./context";

export function AuthProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [trackedBaseUrl, setTrackedBaseUrl] = useState(baseUrl);
  if (trackedBaseUrl !== baseUrl) {
    setTrackedBaseUrl(baseUrl);
    setStatus("loading");
    setUserState(null);
  }

  const setUser = useCallback((next: CurrentUser | null) => {
    setUserState(next);
    setStatus(next === null ? "anonymous" : "authenticated");
    if (next === null) {
      setCsrfToken(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void bootstrapSession(baseUrl, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) {
          return;
        }
        setUserState(next);
        setStatus(next === null ? "anonymous" : "authenticated");
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setCsrfToken(null);
        setUserState(null);
        setStatus("anonymous");
      });
    return () => controller.abort();
  }, [baseUrl]);

  const value = useMemo<AuthContextValue>(
    () => ({ baseUrl, status, user, setUser }),
    [baseUrl, setUser, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
