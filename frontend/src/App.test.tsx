import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "./App";
import { installFetch, installPublicApi } from "./test/fetch";

describe("application shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders the product name on the locale home page without configuration leaks", async () => {
    installPublicApi();

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(screen.getByRole("link", { name: "Tibetan Verification Network" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Independent fact-checks" })).toBeInTheDocument();
    expect(screen.getByText("Evidence-based · Human-reviewed")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/en");
    expect(document.body.textContent).not.toContain("localhost:8000");
    expect(document.body.textContent).not.toContain("VITE_");
    expect(document.body.textContent).not.toContain("Tibetan FactCheck");
  });

  it("reports an unavailable API without the response body", async () => {
    window.history.replaceState(null, "", "/en/fact-checks");
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
    window.history.replaceState(null, "", "/en/fact-checks");
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
