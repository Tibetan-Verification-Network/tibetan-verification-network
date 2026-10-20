import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF } from "../test/editorialApi";
import { makeSnapshot } from "../test/fixtures";
import { renderApp } from "../test/renderApp";

const EN = `/editorial/factchecks/${ID.factCheck}/en`;

describe("approve", () => {
  it("names the exact revision being approved, in the button and in the dialog", async () => {
    const api = installEditorialApi({ languageStatus: "ready_for_approval", user: STAFF.approver });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Approve revision 3" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "You approve revision 3 of “Does the river run dry every winter?”",
    );
    await expectAccessible();
    await user.click(within(dialog).getByRole("button", { name: "Approve revision 3" }));
    expect(api.callsTo("POST", /approve$/)[0]?.body).toEqual({ expected_revision: 3 });
    expect(await screen.findByText("Approved.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Review and publish" })).toBeInTheDocument();
  });

  it("does not approve when the revision moved on", async () => {
    const api = installEditorialApi({ languageStatus: "ready_for_approval", user: STAFF.approver });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Approve revision 3" }));
    api.state.revision = 4;
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve revision 3" }),
    );
    expect(
      await screen.findByText(/Someone else saved this draft after you opened it/),
    ).toBeInTheDocument();
  });

  it("hides approval from editors", async () => {
    installEditorialApi({ languageStatus: "ready_for_approval", user: STAFF.editor });
    renderApp(EN);
    await screen.findByRole("heading", { name: "Review" });
    expect(screen.queryByRole("button", { name: /Approve revision/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Approval and publication" }),
    ).not.toBeInTheDocument();
  });
});

describe("publish", () => {
  it("shows the public snapshot and needs the slug typed before publishing", async () => {
    const api = installEditorialApi({ languageStatus: "approved", user: STAFF.approver });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Review and publish" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("What will be published")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Gauge data from 2015 to 2025 shows flow in every month."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Check station 4/)).not.toBeInTheDocument();
    await expectAccessible();

    const publish = within(dialog).getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type river-claim to confirm"), "river-claim");
    expect(publish).toBeEnabled();
    await user.click(publish);
    expect(api.callsTo("POST", /publish$/)[0]?.body).toEqual({ correction_note: null });
    expect(await screen.findByText("Published.")).toBeInTheDocument();
    expect(await screen.findByText("Checksum matches")).toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the button that opened it", async () => {
    installEditorialApi({ languageStatus: "approved", user: STAFF.approver });
    const user = userEvent.setup();
    renderApp(EN);
    const opener = await screen.findByRole("button", { name: "Review and publish" });
    await user.click(opener);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("blocks publishing while the preview reports readiness issues", async () => {
    installEditorialApi({
      languageStatus: "approved",
      user: STAFF.approver,
      override: (call) =>
        call.path.endsWith("/publish-preview")
          ? {
              status: 200,
              body: {
                snapshot: makeSnapshot(),
                kind: "initial",
                revision_number: 3,
                correction_note_required: false,
                readiness_issues: ["evidence_not_verified"],
              },
            }
          : null,
    });
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Review and publish" }));
    expect(
      await screen.findByText("Verify every piece of evidence in the investigation."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });
});

describe("corrections and withdrawal", () => {
  async function publishedArticle() {
    const api = installEditorialApi({ languageStatus: "published", user: STAFF.approver });
    api.state.versions.push({
      version_number: 1,
      kind: "initial",
      published_at: "2026-03-01T10:00:00Z",
      content_checksum: "c".repeat(64),
      checksum_valid: true,
      snapshot: makeSnapshot(),
    });
    return api;
  }

  it("starts a correction with a kind and a reason, then needs a note to republish", async () => {
    const api = await publishedArticle();
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Start a correction" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Start a correction" });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("Kind of change"), "update");
    await user.type(within(dialog).getByLabelText("Why is this needed?"), "New data");
    await user.click(confirm);
    expect(api.callsTo("POST", /corrections$/)[0]?.body).toEqual({
      kind: "update",
      reason: "New data",
    });
    await waitFor(() => expect(api.state.draft.editorial_status).toBe("draft"));
  });

  it("requires a typed slug, a public notice and an internal reason to withdraw", async () => {
    const api = await publishedArticle();
    const user = userEvent.setup();
    renderApp(EN);
    await user.click(await screen.findByRole("button", { name: "Withdraw" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Withdraw" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Public notice/), "Withdrawn: source retracted.");
    await user.type(within(dialog).getByLabelText(/Internal reason/), "Retraction");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type river-claim to confirm"), "river-claim");
    await expectAccessible();
    await user.click(confirm);
    expect(api.callsTo("POST", /withdraw$/)[0]?.body).toEqual({
      public_notice: "Withdrawn: source retracted.",
      internal_reason: "Retraction",
    });
    expect(await screen.findByText("Withdrawn.")).toBeInTheDocument();
  });

  it("lists published versions with checksum status and opens one", async () => {
    await publishedArticle();
    const user = userEvent.setup();
    renderApp(EN);
    expect(await screen.findByText("Checksum matches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View" }));
    const version = screen.getByText("Version 1").closest("li") as HTMLElement;
    expect(
      await within(version).findByText("Gauge records show continuous flow."),
    ).toBeInTheDocument();
  });

  it("flags a version whose checksum no longer matches", async () => {
    const api = await publishedArticle();
    const first = api.state.versions[0];
    if (first) first.checksum_valid = false;
    renderApp(EN);
    expect(await screen.findByText("Checksum does not match")).toBeInTheDocument();
  });

  it("does not show correction or withdrawal to editors", async () => {
    installEditorialApi({ languageStatus: "published", user: STAFF.editor });
    renderApp(EN);
    await screen.findByRole("heading", { name: "Published versions" });
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a correction" })).not.toBeInTheDocument();
  });
});
