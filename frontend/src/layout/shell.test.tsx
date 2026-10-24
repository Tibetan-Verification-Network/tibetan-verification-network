import { screen, within } from "@testing-library/react";
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
    const nav = screen.getByRole("navigation", { name: "Public" });
    expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "About" })).toBeVisible();
  });

  it("opens the narrow menu and reaches its links from the keyboard", async () => {
    installNarrowViewport();
    installAnonymousApi();
    const user = userEvent.setup();
    renderApp("/");

    const nav = screen.getByRole("navigation", { name: "Public" });
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(within(nav).queryByRole("link", { name: "About" })).not.toBeInTheDocument();
    await user.click(menu);
    expect(within(nav).getByRole("link", { name: "About" })).toBeVisible();
    screen.getByRole("button", { name: "Close menu" }).focus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
  });

  it("has no public registration path", async () => {
    installAnonymousApi();
    renderApp("/");
    expect(
      screen.queryByRole("link", { name: /register|create an account/i }),
    ).not.toBeInTheDocument();

    const denied = renderApp("/register");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(denied.container.textContent).not.toMatch(/sign up/i);
  });
});
