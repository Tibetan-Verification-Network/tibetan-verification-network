import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF } from "../test/editorialApi";
import { renderApp } from "../test/renderApp";

describe("investigations list", () => {
  it("lists investigations with their status and offers a new one", async () => {
    installEditorialApi();
    renderApp("/editorial/investigations");
    expect(await screen.findByRole("link", { name: /river stops flowing/i })).toBeInTheDocument();
    expect(document.querySelector(".status-badge")).toHaveTextContent("Researching");
    expect(screen.getByRole("button", { name: "New investigation" })).toBeInTheDocument();
    await expectAccessible();
  });

  it("does not offer a new investigation to approvers", async () => {
    installEditorialApi({ user: STAFF.approver });
    renderApp("/editorial/investigations");
    await screen.findByRole("link", { name: /river stops flowing/i });
    expect(screen.queryByRole("button", { name: "New investigation" })).not.toBeInTheDocument();
  });
});

describe("investigation workspace", () => {
  it("shows status, people, sources, evidence, documents and internal notes", async () => {
    installEditorialApi();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: /river stops flowing/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Gauge spreadsheet" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Internal notes" })).toBeInTheDocument();
    expect(screen.getByText(/Verify each piece of evidence/)).toBeInTheDocument();
    // Internal text is always labelled, and the public fields are not in the same panel.
    expect(screen.getAllByText("Internal — never published").length).toBeGreaterThanOrEqual(3);
    await expectAccessible();
  });

  it("verifies evidence and records who did it", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Verify evidence 1" }));
    expect(api.callsTo("POST", /\/evidence\/[^/]+\/verify$/)).toHaveLength(1);
    expect(await screen.findByText(/Verified by Tenzin Editor/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify evidence 1" })).not.toBeInTheDocument();
  });

  it("adds a source with public fields and internal reliability notes kept apart", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Add source" }));
    const form = screen.getByRole("heading", { name: "Add source", level: 3 })
      .nextElementSibling as HTMLElement;
    const publicGroup = within(form).getByRole("group", {
      name: "Public copy — appears on the published article",
    });
    const internalGroup = within(form).getByRole("group", { name: "Internal — never published" });
    expect(within(publicGroup).getByLabelText("Title")).toBeInTheDocument();
    expect(within(publicGroup).queryByLabelText("Reliability notes")).not.toBeInTheDocument();
    expect(within(internalGroup).getByLabelText("Reliability notes")).toBeInTheDocument();

    await user.type(within(form).getByLabelText("Title"), "Weather service bulletin");
    await user.type(within(form).getByLabelText("Reliability notes"), "Government source");
    await user.click(within(form).getByRole("button", { name: "Add source" }));

    const call = api.callsTo("POST", /\/sources$/)[0];
    expect(call?.body).toMatchObject({
      title: "Weather service bulletin",
      reliability_notes: "Government source",
    });
    expect(await screen.findByText("Weather service bulletin")).toBeInTheDocument();
  });

  it("saves internal notes only when they changed", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    const notes = await screen.findByLabelText("Notes");
    const save = screen
      .getAllByRole("button", { name: "Save" })
      .find((button) => button.closest("form")?.contains(notes)) as HTMLElement;
    expect(save).toBeDisabled();
    await user.type(notes, " Also check station 6.");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(api.callsTo("PATCH", /investigations\/[^/]+$/)[0]?.body).toEqual({
      internal_notes: "Check station 4. Also check station 6.",
    });
  });

  it("asks for a reason before putting an investigation on hold", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Put on hold" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Put on hold" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason"), "Waiting for the station");
    await user.click(within(dialog).getByRole("button", { name: "Put on hold" }));
    expect(api.callsTo("POST", /\/status$/)[0]?.body).toEqual({
      status: "on_hold",
      reason: "Waiting for the station",
    });
    expect(await screen.findByText(/On hold because:/)).toBeInTheDocument();
  });

  it("starts the fact-check in the chosen languages and opens it", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Start fact-check" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("བོད་ཡིག"));
    await user.click(within(dialog).getByRole("button", { name: "Start fact-check" }));
    expect(api.callsTo("POST", /\/factcheck$/)[0]?.body).toEqual({ languages: ["en"] });
  });

  it("lets only editors assign people", async () => {
    installEditorialApi({ user: STAFF.researcher });
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await screen.findByRole("heading", { name: "People" });
    expect(screen.queryByLabelText("Add a person")).not.toBeInTheDocument();
  });

  it("shows a frozen investigation as read only", async () => {
    installEditorialApi({ languageStatus: "in_review" });
    renderApp(`/editorial/investigations/${ID.investigation}`);
    expect(await screen.findByText(/frozen while its fact-check is in review/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add evidence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify evidence 1" })).not.toBeInTheDocument();
  });

  it("maps a 409 to a conflict message with a reload option", async () => {
    installEditorialApi({
      override: (call) =>
        call.method === "POST" && call.path.endsWith("/verify")
          ? { status: 409, body: { detail: { code: "investigation_frozen", message: "Frozen" } } }
          : null,
    });
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    await user.click(await screen.findByRole("button", { name: "Verify evidence 1" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The investigation is frozen");
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
