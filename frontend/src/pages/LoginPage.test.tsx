import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { installFetch, requestUrl } from "../test/fetch";
import { CSRF, EDITOR } from "../test/fixtures";
import { renderApp } from "../test/renderApp";

describe("staff login", () => {
  it("shows labels and an error summary when required fields are empty", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      throw new Error(`Unhandled fetch ${url}`);
    });
    const user = userEvent.setup();
    renderApp("/login");

    expect(await screen.findByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Correct the following" })).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("link", { name: "Enter Email." })).toHaveAttribute("href", "#email");
  });

  it("shows a generic failure and does not render the session or CSRF token", async () => {
    const fetchMock = installFetch((url, init) => {
      if (url.endsWith("/api/v1/me") && (init.method ?? "GET") === "GET") {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      if (url.endsWith("/api/v1/auth/login")) {
        return { status: 401, body: { detail: "Invalid email or password." } };
      }
      throw new Error(`Unhandled fetch ${url}`);
    });
    const user = userEvent.setup();
    renderApp("/login");
    await screen.findByLabelText("Email");
    await user.type(screen.getByLabelText("Email"), "editor@example.org");
    await user.type(screen.getByLabelText("Password"), "not-the-real-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("not-the-real-password");
    expect(document.body.textContent).not.toContain(CSRF);

    const loginCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).endsWith("/api/v1/auth/login"),
    );
    const init = loginCall?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBeNull();
  });

  it("signs in and opens the editorial shell without putting the CSRF token on the page", async () => {
    let signedIn = false;
    installFetch((url, init) => {
      const method = (init.method ?? "GET").toUpperCase();
      if (url.endsWith("/api/v1/auth/login")) {
        signedIn = true;
        return { status: 200, body: { csrf_token: CSRF } };
      }
      if (url.endsWith("/api/v1/me")) {
        return signedIn
          ? { status: 200, body: EDITOR }
          : { status: 401, body: { detail: "Authentication required" } };
      }
      if (url.endsWith("/api/v1/auth/csrf")) {
        return { status: 200, body: { csrf_token: CSRF } };
      }
      if (url.endsWith("/api/v1/editorial/status")) {
        return { status: 200, body: { status: "ok", roles: ["editor"] } };
      }
      if (method === "GET" && url.endsWith("/ready")) {
        return { status: 200, body: { status: "ready" } };
      }
      throw new Error(`Unhandled ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderApp("/login");
    await screen.findByLabelText("Email");
    await user.type(screen.getByLabelText("Email"), "editor@example.org");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Signed in as Tenzin")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CSRF);
    expect(localStorage.getItem("tvn.session")).toBeNull();
    await waitFor(() => {
      expect(screen.getByText("The editorial service accepted this session.")).toBeInTheDocument();
    });
  });
});
