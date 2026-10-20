import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "./App";
import { installFetch, installPublicApi, requestUrl } from "./test/fetch";

describe("application shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders the product name on the locale home page without configuration leaks", async () => {
    const fetchMock = installPublicApi();

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(
      screen.getByRole("heading", { name: "Tibetan Verification Network" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Does the river run dry every winter?")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/en");

    const listCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).includes("/api/v1/factchecks"),
    );
    expect(listCall).toBeDefined();
    const init = listCall?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(document.body.textContent).not.toContain("localhost:8000");
    expect(document.body.textContent).not.toContain("VITE_");
    expect(document.body.textContent).not.toContain("Tibetan FactCheck");
  });

  it("reports an unavailable API without the response body", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      if (url.includes("/api/v1/topics")) {
        return { status: 200, body: { items: [] } };
      }
      return { status: 503, body: { detail: "postgresql://hidden", database_url: "hidden" } };
    });

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(
      await screen.findByText("Fact-checks could not be loaded.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("postgresql");
    expect(document.body.textContent).not.toContain("database_url");
  });

  it("reports an unavailable API when the network fails", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      throw new Error("postgresql://auditor:super-secret-password@db/tvn");
    });

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(
      await screen.findByText("Fact-checks could not be loaded.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("super-secret-password");
  });
});
