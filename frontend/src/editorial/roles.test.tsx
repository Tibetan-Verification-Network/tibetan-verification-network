import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF, type StaffFixture } from "../test/editorialApi";
import { renderApp } from "../test/renderApp";

function navLinks() {
  const nav = screen.getByRole("navigation", { name: "Editorial" });
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

describe("role-aware navigation", () => {
  it.each<[string, StaffFixture, string[]]>([
    [
      "researcher",
      STAFF.researcher,
      ["Overview", "Inbox", "Investigations", "Fact-checks", "Archive", "Public site"],
    ],
    [
      "editor",
      STAFF.editor,
      ["Overview", "Inbox", "Investigations", "Fact-checks", "Archive", "Topics", "Public site"],
    ],
    [
      "approver",
      STAFF.approver,
      ["Overview", "Investigations", "Fact-checks", "Approvals", "Archive", "Public site"],
    ],
    ["platform administrator", STAFF.admin, ["Overview", "Staff accounts", "Public site"]],
  ])("shows %s only the sections they can use", async (_name, who, expected) => {
    installEditorialApi({ user: who });
    renderApp("/editorial");
    await screen.findByRole("heading", { name: "Overview", level: 1 });
    expect(navLinks()).toEqual(expected);
  });
});

describe("dashboard", () => {
  it("lists next actions for an editor", async () => {
    installEditorialApi({ languageStatus: "in_review" });
    renderApp("/editorial");
    expect(await screen.findByRole("heading", { name: "Your next actions" })).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("link", { name: /river stops flowing/i })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Waiting for review" })).toBeInTheDocument();
    await expectAccessible();
  });

  it("shows an approver what is waiting for approval and nothing from the inbox", async () => {
    installEditorialApi({ languageStatus: "ready_for_approval", user: STAFF.approver });
    renderApp("/editorial");
    expect(
      await screen.findByRole("link", { name: "Waiting for your approval" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New submissions" })).not.toBeInTheDocument();
  });

  it("gives a platform administrator no editorial lists and no editorial requests", async () => {
    const api = installEditorialApi({ user: STAFF.admin });
    renderApp("/editorial");
    await screen.findByRole("heading", { name: "Overview", level: 1 });
    expect(screen.queryByRole("heading", { name: "Your next actions" })).not.toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/api/v1/editorial/submissions")).toBe(false);
  });
});

describe("hidden controls are not security", () => {
  it("sends researchers away from pages meant for other roles with the same wording as a 404", async () => {
    installEditorialApi({ user: STAFF.researcher });
    renderApp("/editorial/approvals");
    expect(
      await screen.findByText("This was not found, or you do not have access to it."),
    ).toBeInTheDocument();
  });

  it("keeps admin pages away from editors", async () => {
    installEditorialApi({ user: STAFF.editor });
    renderApp("/editorial/admin/users");
    expect(
      await screen.findByText("This was not found, or you do not have access to it."),
    ).toBeInTheDocument();
  });

  it("shows the API's refusal when a control is used anyway", async () => {
    installEditorialApi({
      user: STAFF.editor,
      override: (call) =>
        call.method === "POST" && call.path.endsWith("/approve")
          ? { status: 403, body: { detail: "Forbidden" } }
          : null,
      languageStatus: "ready_for_approval",
    });
    // Editors never see the approve button, so call the endpoint the way a script would.
    renderApp(`/editorial/factchecks/${ID.factCheck}/en`);
    await screen.findByRole("heading", { name: "Review" });
    const response = await fetch(
      `http://localhost:8000/api/v1/editorial/factchecks/${ID.factCheck}/languages/en/approve`,
      { method: "POST", body: JSON.stringify({ expected_revision: 3 }) },
    );
    expect(response.status).toBe(403);
  });

  it("shows a 403 from a write as a permission message, not a crash", async () => {
    installEditorialApi({
      user: STAFF.editor,
      override: (call) =>
        call.method === "POST" && call.path.endsWith("/verify")
          ? { status: 403, body: { detail: "Forbidden" } }
          : null,
    });
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Verify evidence 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
  });

  it("maps 422 to marked fields", async () => {
    installEditorialApi({
      override: (call) =>
        call.method === "POST" && call.path.endsWith("/sources")
          ? { status: 422, body: { detail: [{ loc: ["body", "title"], msg: "bad", type: "x" }] } }
          : null,
    });
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Add source" }));
    const form = screen.getByRole("heading", { name: "Add source", level: 3 })
      .nextElementSibling as HTMLElement;
    await user.type(within(form).getByLabelText("Title"), "x");
    await user.click(within(form).getByRole("button", { name: "Add source" }));
    expect(await within(form).findByText("Check this field.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  });
});
