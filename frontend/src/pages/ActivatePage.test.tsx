import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "../auth/AuthProvider";
import { I18nProvider } from "../i18n/I18nProvider";
import { AppRoutes } from "../routes";
import { installFetch, requestUrl } from "../test/fetch";

const TOKEN = "invite-secret-token-value";

function SearchProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

function renderActivate(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider baseUrl="http://localhost:8000">
        <MemoryRouter initialEntries={[path]}>
          <SearchProbe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
}

function anonymousMe(url: string) {
  if (url.endsWith("/api/v1/me")) {
    return { status: 401, body: { detail: "Authentication required" } };
  }
  return null;
}

describe("invite activation", () => {
  it("reads an invite token from the URL into the form and then removes it", async () => {
    installFetch((url) => anonymousMe(url) ?? Promise.reject(new Error(url)));
    renderActivate(`/activate?token=${TOKEN}`);

    expect(await screen.findByLabelText("Invite token")).toHaveValue(TOKEN);
    expect(screen.getByTestId("search")).toHaveTextContent("");
    expect(JSON.stringify(localStorage)).not.toContain(TOKEN);
    expect(sessionStorage.length).toBe(0);
    expect(document.title).not.toContain(TOKEN);
  });

  it("explains a password mismatch and an invalid invite without repeating the token", async () => {
    const fetchMock = installFetch((url) => {
      return (
        anonymousMe(url) ?? {
          status: 400,
          body: { detail: "Invalid or expired invite" },
        }
      );
    });
    const user = userEvent.setup();
    renderActivate("/activate");

    await user.type(await screen.findByLabelText("Invite token"), TOKEN);
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.type(screen.getByLabelText("Confirm password"), "different-horse-battery");
    await user.click(screen.getByRole("button", { name: "Activate account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input as RequestInfo | URL).includes("activate"),
      ),
    ).toBe(false);

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Activate account" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("This invite is invalid or has expired.");
    });
    expect(screen.getByRole("alert")).not.toHaveTextContent(TOKEN);
  });

  it("confirms activation and links to staff login", async () => {
    installFetch((url, init) => {
      const method = (init.method ?? "GET").toUpperCase();
      if (url.endsWith("/api/v1/auth/activate") && method === "POST") {
        return {
          status: 201,
          body: {
            id: "22222222-2222-4222-8222-222222222222",
            email: "editor@example.org",
            display_name: "Tenzin",
            roles: ["editor"],
            is_active: true,
          },
        };
      }
      return anonymousMe(url) ?? { status: 404, body: {} };
    });
    const user = userEvent.setup();
    renderActivate("/activate");
    await user.type(await screen.findByLabelText("Invite token"), TOKEN);
    await user.type(screen.getByLabelText("Display name"), "Tenzin");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.type(screen.getByLabelText("Confirm password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Activate account" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Account activated. You can log in.",
    );
    expect(screen.getByRole("link", { name: "Go to staff login" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByLabelText("Invite token")).not.toBeInTheDocument();
    expect(JSON.stringify(localStorage)).not.toContain(TOKEN);
  });
});
