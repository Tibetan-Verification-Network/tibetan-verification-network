import { afterEach, describe, expect, it, vi } from "vitest";

import { login, logout } from "./auth";
import { getCsrfToken, resetApiState } from "./client";

const BASE = "http://localhost:8000";

afterEach(() => {
  resetApiState();
});

describe("api client", () => {
  it("sends cookies on login without a CSRF header and keeps the token in memory", async () => {
    localStorage.setItem("tvn.locale", "en");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ csrf_token: "csrf-memory-token-should-not-render" }));
    vi.stubGlobal("fetch", fetchMock);

    await login(BASE, "editor@example.org", "correct-horse-battery-staple");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(headers.get("X-CSRF-Token")).toBeNull();
    expect(getCsrfToken()).toBe("csrf-memory-token-should-not-render");
    expect(Object.keys(localStorage)).toEqual(["tvn.locale"]);
    expect(sessionStorage.length).toBe(0);
  });

  it("adds the CSRF header to cookie-authenticated mutations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrf_token: "fresh-csrf-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await login(BASE, "editor@example.org", "correct-horse-battery-staple");
    await logout(BASE);

    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(`${BASE}/api/v1/auth/logout`);
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(headers.get("X-CSRF-Token")).toBe("fresh-csrf-token");
    expect(getCsrfToken()).toBeNull();
  });
});
