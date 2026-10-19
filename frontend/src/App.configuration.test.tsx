import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  readApiBaseUrl: () => {
    throw new Error("postgresql://auditor:super-secret-password@db.internal/tvn");
  },
}));

import { App } from "./App";

describe("configuration failure", () => {
  it("shows a fixed message and hides the rejected configuration", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Tibetan Verification Network" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This application is not configured correctly.",
    );
    expect(document.body.textContent).not.toContain("super-secret-password");
    expect(document.body.textContent).not.toContain("postgresql");
  });
});
