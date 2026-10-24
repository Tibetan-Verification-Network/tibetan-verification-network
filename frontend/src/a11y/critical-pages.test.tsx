import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfigurationProblem } from "../App";
import { I18nProvider } from "../i18n/I18nProvider";
import { expectAccessible } from "../test/a11y";
import { installAnonymousApi, installFetch } from "../test/fetch";
import { CSRF, EDITOR } from "../test/fixtures";
import { renderApp } from "../test/renderApp";

describe("critical page accessibility", () => {
  it("has no detectable violations on the public home page", async () => {
    installAnonymousApi();
    renderApp("/");
    expect(
      await screen.findByRole("heading", {
        name: "A Resilient and Trusted Tibetan Information Ecosystem",
      }),
    ).toBeInTheDocument();
    await expectAccessible();
  });

  it("has no detectable violations on staff login and activation", async () => {
    installAnonymousApi();
    const login = renderApp("/login");
    expect(await screen.findByRole("heading", { name: "Staff login" })).toBeInTheDocument();
    await expectAccessible();
    login.unmount();

    installAnonymousApi();
    renderApp("/activate");
    expect(
      await screen.findByRole("heading", { name: "Activate staff invite" }),
    ).toBeInTheDocument();
    await expectAccessible();
  });

  it("has no detectable violations on the editorial shell", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return { status: 200, body: EDITOR };
      }
      if (url.endsWith("/api/v1/auth/csrf")) {
        return { status: 200, body: { csrf_token: CSRF } };
      }
      if (url.endsWith("/api/v1/editorial/status")) {
        return { status: 200, body: { status: "ok", roles: ["editor"] } };
      }
      throw new Error(`Unhandled fetch ${url}`);
    });
    renderApp("/editorial");
    expect(
      await screen.findByText("The editorial service accepted this session."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CSRF);
    await expectAccessible();
  });

  it("has no detectable violations when configuration is missing", async () => {
    render(
      <I18nProvider>
        <ConfigurationProblem />
      </I18nProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This application is not configured correctly.",
    );
    await expectAccessible();
  });
});
