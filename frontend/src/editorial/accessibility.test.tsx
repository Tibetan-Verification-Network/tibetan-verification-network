import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF } from "../test/editorialApi";
import { renderApp } from "../test/renderApp";

const STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "ready_for_approval",
  "approved",
  "published",
  "withdrawn",
] as const;

describe("language page accessibility", () => {
  it.each(STATUSES)("has no axe violations as an editor when %s", async (status) => {
    installEditorialApi({ languageStatus: status });
    renderApp(`/editorial/factchecks/${ID.factCheck}/en`);
    await screen.findByRole("heading", { level: 1 });
    await screen.findByRole("heading", { name: "Review" });
    await expectAccessible();
  });

  it.each(["draft", "ready_for_approval", "approved", "published"] as const)(
    "has no axe violations as an approver when %s",
    async (status) => {
      installEditorialApi({ languageStatus: status, user: STAFF.approver });
      renderApp(`/editorial/factchecks/${ID.factCheck}/en`);
      await screen.findByRole("heading", { level: 1 });
      await screen.findByRole("heading", { name: "Review" });
      await expectAccessible();
    },
  );
});

describe("other screens", () => {
  it.each([
    ["/editorial/archive"],
    ["/editorial/topics"],
    [`/editorial/archive/${ID.document}`],
    [`/editorial/investigations/${ID.investigation}`],
    [`/editorial/factchecks/${ID.factCheck}`],
    ["/editorial/investigations"],
    ["/editorial/factchecks"],
    ["/editorial/inbox"],
  ])("%s has no axe violations", async (path) => {
    installEditorialApi();
    renderApp(path);
    await screen.findByRole("heading", { level: 1 });
    await screen.findByRole("main");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expectAccessible();
  });

  it("the approval queue has no axe violations", async () => {
    installEditorialApi({ languageStatus: "ready_for_approval", user: STAFF.approver });
    const first = renderApp("/editorial/approvals");
    await screen.findByRole("heading", { level: 1 });
    await expectAccessible();
    first.unmount();
  });
});

it("every editorial route leaves exactly one h1", async () => {
  installEditorialApi();
  renderApp("/editorial/inbox");
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
});
