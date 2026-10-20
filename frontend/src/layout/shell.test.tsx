import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { installAnonymousApi } from "../test/fetch";
import { renderApp } from "../test/renderApp";

function installNarrowViewport() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

describe("public shell", () => {
  it("moves from the skip link to main content with the keyboard", async () => {
    installAnonymousApi();
    const user = userEvent.setup();
    renderApp("/");

    await user.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(document.getElementById("main")).toHaveFocus();
  });

  it("keeps navigation visible on a wide viewport", async () => {
    installAnonymousApi();
    renderApp("/");
    expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toBeVisible();
    expect(await screen.findByText("Does the river run dry every winter?")).toBeInTheDocument();
  });

  it("opens the narrow menu and reaches its links from the keyboard", async () => {
    installNarrowViewport();
    installAnonymousApi();
    const user = userEvent.setup();
    renderApp("/");

    const menu = screen.getByRole("button", { name: "Menu" });
    expect(screen.queryByRole("link", { name: "About" })).not.toBeInTheDocument();
    await user.click(menu);
    expect(screen.getByRole("link", { name: "About" })).toBeVisible();
    screen.getByRole("button", { name: "Close menu" }).focus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
  });

  it("has no public registration path", async () => {
    installAnonymousApi();
    renderApp("/");
    expect(screen.queryByRole("link", { name: /register|sign up/i })).not.toBeInTheDocument();

    renderApp("/register");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sign up/i);
  });
});
