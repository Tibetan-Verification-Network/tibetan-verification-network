import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF } from "../test/editorialApi";
import { renderApp } from "../test/renderApp";

const EN = `/editorial/factchecks/${ID.factCheck}/en`;

describe("fact-check list and detail", () => {
  it("lists fact-checks with the status of each language", async () => {
    installEditorialApi({ languageStatus: "draft" });
    renderApp("/editorial/factchecks");
    expect(
      await screen.findByRole("link", { name: "Does the river run dry every winter?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "English: Draft" })).toBeInTheDocument();
    await expectAccessible();
  });

  it("shows languages, a slug form and topics, and saves the slug", async () => {
    const api = installEditorialApi({ languageStatus: "draft" });
    const user = userEvent.setup();
    renderApp(`/editorial/factchecks/${ID.factCheck}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "river-claim" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "བོད་ཡིག" })).toBeInTheDocument();
    const slug = screen.getByLabelText("Public address (slug)");
    await user.clear(slug);
    await user.type(slug, "river-flow");
    await user.click(
      within(slug.closest("form") as HTMLElement).getByRole("button", { name: "Save" }),
    );
    expect(api.callsTo("PATCH", /factchecks\/[^/]+$/)[0]?.body).toEqual({
      public_slug: "river-flow",
    });
    await expectAccessible();
  });

  it("lets only editors change topics", async () => {
    installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    renderApp(`/editorial/factchecks/${ID.factCheck}`);
    expect(await screen.findByRole("heading", { name: "Topics" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Environment")).not.toBeInTheDocument();
  });
});

describe("draft editor", () => {
  it("shows structured fields, internal and public copy apart, and passes axe", async () => {
    installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    renderApp(EN);
    expect(await screen.findByLabelText("Title")).toHaveValue(
      "Does the river run dry every winter?",
    );
    expect(screen.getByLabelText("Analysis (Markdown)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Readiness" })).toBeInTheDocument();
    // Reviewer comments are internal and sit in their own labelled panel.
    const review = screen
      .getByRole("heading", { name: "Review" })
      .closest("section") as HTMLElement;
    expect(within(review).getByText("Internal — never published")).toBeInTheDocument();
    await expectAccessible();
  });

  it("saves only the fields that changed, against the revision it started from", async () => {
    const api = installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    const user = userEvent.setup();
    renderApp(EN);
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "River flow, winter");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    const patch = api.callsTo("PATCH", /languages\/en$/)[0];
    expect(patch?.body).toEqual({ expected_revision: 3, title: "River flow, winter" });
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("renders the server preview of the Markdown", async () => {
    installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Preview Markdown" }));
    const preview = (await screen.findByRole("heading", { name: "Preview" })).closest(
      "section",
    ) as HTMLElement;
    expect(within(preview).getByText("analysis")).toBeInTheDocument();
  });

  it("handles a revision conflict: keeps typing, names fields, and lets the writer choose", async () => {
    const api = installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    api.state.remoteDraftEdit = { summary: "Edited elsewhere", title: "Their title" };
    const user = userEvent.setup();
    renderApp(EN);
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "My title");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const alert = await screen.findByText("Someone else saved this draft.");
    const region = alert.closest("[role=alert]") as HTMLElement;
    expect(region).toHaveTextContent("Changed by the other person: Title, Summary.");
    expect(region).toHaveTextContent("Changed by both of you (yours would win): Title.");
    expect(screen.getByLabelText("Title")).toHaveValue("My title");
    await expectAccessible();

    await user.click(within(region).getByRole("button", { name: "Keep my changes and save" }));
    await waitFor(() => expect(api.callsTo("PATCH", /languages\/en$/)).toHaveLength(2));
    // Only my field is sent, so their summary survives.
    expect(api.callsTo("PATCH", /languages\/en$/)[1]?.body).toEqual({
      expected_revision: 4,
      title: "My title",
    });
    expect(api.state.draft.summary).toBe("Edited elsewhere");
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
    expect(screen.queryByText("Someone else saved this draft.")).not.toBeInTheDocument();
  });

  it("can discard local edits and load the latest after a conflict", async () => {
    const api = installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    api.state.remoteDraftEdit = { title: "Their title" };
    const user = userEvent.setup();
    renderApp(EN);
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Mine");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.click(
      await screen.findByRole("button", { name: "Discard mine and load the latest" }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Their title");
  });

  it("reorders and saves the cited sources with a relevance note", async () => {
    const api = installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    const user = userEvent.setup();
    renderApp(EN);
    const note = await screen.findByLabelText("Why this source matters");
    await user.clear(note);
    await user.type(note, "Primary gauge data");
    await user.click(screen.getByRole("button", { name: "Save sources" }));
    expect(api.callsTo("PUT", /languages\/en\/sources$/)[0]?.body).toEqual({
      items: [{ source_id: ID.source, relevance_note: "Primary gauge data", position: 0 }],
    });
  });

  it("locks the editor while the draft is in review", async () => {
    installEditorialApi({ languageStatus: "in_review", user: STAFF.researcher });
    renderApp(EN);
    expect(await screen.findByText(/cannot be edited in its current status/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeDisabled();
  });
});

describe("review", () => {
  it("lets a researcher submit for review, but not review or approve", async () => {
    const api = installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    const user = userEvent.setup();
    renderApp(EN);
    expect(await screen.findByRole("button", { name: "Submit for review" })).toBeEnabled();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark ready for approval" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Approval and publication" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(api.callsTo("POST", /submit-for-review$/)).toHaveLength(1);
    expect(await screen.findByText("Submitted for review.")).toBeInTheDocument();
  });

  it("will not submit with unsaved changes", async () => {
    installEditorialApi({ languageStatus: "draft", user: STAFF.researcher });
    const user = userEvent.setup();
    renderApp(EN);
    await user.type(await screen.findByLabelText("Title"), "!");
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    expect(screen.getByText("Save your changes before submitting.")).toBeInTheDocument();
  });

  it("lets an editor comment, mark ready and request changes", async () => {
    const api = installEditorialApi({ languageStatus: "in_review", user: STAFF.editor });
    const user = userEvent.setup();
    renderApp(EN);
    await user.type(
      await screen.findByLabelText("Add a comment"),
      "Please cite the second station.",
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(api.callsTo("POST", /\/reviews$/)[0]?.body).toEqual({
      comments: "Please cite the second station.",
    });
    expect(await screen.findByText("Please cite the second station.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark ready for approval" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Revision 3 goes to an approver/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Mark ready for approval" }));
    expect(api.callsTo("POST", /mark-ready$/)).toHaveLength(1);
    expect(await screen.findByText("Marked ready for approval.")).toBeInTheDocument();
  });

  it("requires a reason to request changes", async () => {
    const api = installEditorialApi({ languageStatus: "in_review", user: STAFF.editor });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Request changes" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason"), "Missing a source");
    await user.click(within(dialog).getByRole("button", { name: "Request changes" }));
    expect(api.callsTo("POST", /request-changes$/)[0]?.body).toEqual({
      reason: "Missing a source",
    });
  });

  it("shows the author's refusal when the API says the actor wrote the draft", async () => {
    installEditorialApi({
      languageStatus: "in_review",
      user: STAFF.editor,
      override: (call) =>
        call.path.endsWith("/mark-ready")
          ? { status: 409, body: { detail: { code: "is_author", message: "Author" } } }
          : null,
    });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Mark ready for approval" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Mark ready for approval",
      }),
    );
    expect(await screen.findByText(/You wrote this draft/)).toBeInTheDocument();
  });
});

describe("approval queue", () => {
  it("lists what is waiting and links to the exact revision", async () => {
    installEditorialApi({ languageStatus: "ready_for_approval", user: STAFF.approver });
    renderApp("/editorial/approvals");
    expect(
      await screen.findByRole("link", { name: "Does the river run dry every winter?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Revision 3")).toBeInTheDocument();
    await expectAccessible();
  });
});
