import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { installEditorialApi } from "../test/editorialApi";
import { installFetch, requestUrl } from "../test/fetch";
import { CSRF } from "../test/fixtures";
import { renderApp } from "../test/renderApp";

describe("protected editorial shell", () => {
  it("shows a loading state and then the login page for an anonymous visitor", async () => {
    let releaseMe: (value: { status: number; body?: unknown }) => void = () => undefined;
    const me = new Promise<{ status: number; body?: unknown }>((resolve) => {
      releaseMe = resolve;
    });
    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return me;
      }
      throw new Error(`Unhandled fetch ${url}`);
    });
    renderApp("/editorial");

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByRole("link", { name: "Inbox" })).not.toBeInTheDocument();
    releaseMe({ status: 401, body: { detail: "Authentication required" } });
    expect(await screen.findByRole("heading", { name: "Staff login" })).toBeInTheDocument();
  });

  it("shows the editorial shell for a signed-in staff member", async () => {
    installEditorialApi();
    renderApp("/editorial/inbox");
    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /river stops flowing/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Investigations" })).toBeInTheDocument();
  });

  it("logs out with the CSRF header and rejects the signed-in shell afterward", async () => {
    const { fetchMock } = installEditorialApi();
    const user = userEvent.setup();
    renderApp("/editorial");
    await user.click(await screen.findByRole("button", { name: "Log out" }));

    const logoutCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).endsWith("/api/v1/auth/logout"),
    );
    const init = logoutCall?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe(CSRF);
    expect(await screen.findByRole("heading", { name: "Staff login" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CSRF);
    expect(screen.queryByRole("link", { name: "Inbox" })).not.toBeInTheDocument();
  });
});
