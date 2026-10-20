import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF } from "../test/editorialApi";
import { renderApp } from "../test/renderApp";

describe("inbox", () => {
  it("lists submissions and has no accessibility violations", async () => {
    installEditorialApi();
    renderApp("/editorial/inbox");
    expect(await screen.findByRole("link", { name: /river stops flowing/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("inbox");
    await expectAccessible();
  });

  it("filters by status and keeps the filter in the address", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp("/editorial/inbox");
    await screen.findByRole("link", { name: /river stops flowing/i });
    await user.selectOptions(screen.getByLabelText("Status"), "rejected");
    expect(await screen.findByText("No submissions match.")).toBeInTheDocument();
    expect(api.calls.some((call) => call.search.get("workflow_status") === "rejected")).toBe(true);
  });
});

describe("submission detail", () => {
  it("shows the original wording, duplicates and triage actions without contact data", async () => {
    const api = installEditorialApi();
    renderApp(`/editorial/inbox/${ID.submission}`);
    expect(await screen.findByText("The river stops flowing every winter.")).toBeInTheDocument();
    expect(screen.getByText("Is the river dry in winter?")).toBeInTheDocument();
    expect(screen.queryByText("sonam@example.org")).not.toBeInTheDocument();
    expect(api.state.contactReveals).toBe(0);
    expect(screen.getAllByText("Internal — never published").length).toBeGreaterThan(0);
    await expectAccessible();
  });

  it("fetches contact details only after an explicit reveal and drops them when hidden", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/inbox/${ID.submission}`);
    await user.click(await screen.findByRole("button", { name: "Reveal contact details" }));
    expect(await screen.findByText("sonam@example.org")).toBeInTheDocument();
    expect(api.state.contactReveals).toBe(1);
    await user.click(screen.getByRole("button", { name: "Hide contact details" }));
    expect(screen.queryByText("sonam@example.org")).not.toBeInTheDocument();
  });

  it("requires a reason before rejecting, and states the consequence", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/inbox/${ID.submission}`);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/no investigation is opened/i)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await expectAccessible();
    await user.type(within(dialog).getByLabelText("Reason"), "Not a checkable claim");
    await user.click(confirm);
    const triage = api.callsTo("POST", /triage$/);
    expect(triage).toHaveLength(1);
    expect(triage[0]?.body).toEqual({ action: "reject", reason: "Not a checkable claim" });
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
  });

  it("creates the canonical claim and opens an investigation", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/inbox/${ID.submission}`);
    await user.click(await screen.findByRole("button", { name: "Create canonical claim" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create canonical claim" }));
    expect(api.callsTo("POST", /triage$/)[0]?.body).toMatchObject({ action: "create_claim" });
    await user.click(await screen.findByRole("button", { name: "Open investigation" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Open investigation" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: /river stops flowing/i }),
    ).toBeInTheDocument();
    expect(
      api.calls.some(
        (call) =>
          call.path === "/api/v1/investigations" && call.search.get("claim_id") === ID.claim,
      ),
    ).toBe(true);
  });

  it("shows researchers the triage controls but not the contact reveal", async () => {
    installEditorialApi({ user: STAFF.researcher });
    renderApp(`/editorial/inbox/${ID.submission}`);
    expect(await screen.findByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reveal contact details" }),
    ).not.toBeInTheDocument();
  });

  it("says not found or no access when the API answers 404", async () => {
    installEditorialApi({
      override: (call) =>
        call.path.endsWith(`/submissions/${ID.submission}`)
          ? { status: 404, body: { detail: "Not Found" } }
          : null,
    });
    renderApp(`/editorial/inbox/${ID.submission}`);
    expect(
      await screen.findByText("This was not found, or you do not have access to it."),
    ).toBeInTheDocument();
  });
});
