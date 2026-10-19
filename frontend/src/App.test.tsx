import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./App";
import { installFetch, requestUrl } from "./test/fetch";

describe("application shell", () => {
  it("renders the product name and ready status without configuration", async () => {
    const fetchMock = installFetch((url) => {
      if (url.endsWith("/ready")) {
        return { status: 200, body: { status: "ready" } };
      }
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      throw new Error(`Unhandled fetch ${url}`);
    });

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(
      screen.getByRole("heading", { name: "Tibetan Verification Network" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("API status: Ready");

    const readyCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).endsWith("/ready"),
    );
    expect(readyCall).toBeDefined();
    const init = readyCall?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(document.body.textContent).not.toContain("localhost:8000");
    expect(document.body.textContent).not.toContain("VITE_");
    expect(document.body.textContent).not.toContain("Tibetan FactCheck");
  });

  it("reports an unavailable API without the response body", async () => {
    installFetch((url) => {
      if (url.endsWith("/ready")) {
        return { status: 503, body: { status: "not_ready", database_url: "postgresql://hidden" } };
      }
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      throw new Error(`Unhandled fetch ${url}`);
    });

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(await screen.findByRole("status")).toHaveTextContent("API status: Not ready");
    expect(document.body.textContent).not.toContain("postgresql");
    expect(document.body.textContent).not.toContain("database_url");
  });

  it("reports an unavailable API when the network fails", async () => {
    installFetch((url) => {
      if (url.endsWith("/ready")) {
        throw new Error("postgresql://auditor:super-secret-password@db/tvn");
      }
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      throw new Error(`Unhandled fetch ${url}`);
    });

    render(<AppShell baseUrl="http://localhost:8000" />);

    expect(await screen.findByRole("status")).toHaveTextContent("API status: Not ready");
    expect(document.body.textContent).not.toContain("super-secret-password");
  });
});
