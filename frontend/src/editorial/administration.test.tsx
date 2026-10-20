import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectAccessible } from "../test/a11y";
import { ID, installEditorialApi, STAFF } from "../test/editorialApi";
import { renderApp } from "../test/renderApp";

describe("archive", () => {
  it("lists documents and shows metadata with a short-lived link on request", async () => {
    installEditorialApi();
    const user = userEvent.setup();
    renderApp("/editorial/archive");
    await user.click(await screen.findByRole("link", { name: "Gauge spreadsheet" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Gauge spreadsheet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the document" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create a link" }));
    const link = await screen.findByRole("link", { name: "Open the document" });
    expect(link).toHaveAttribute("href", "https://files.example.org/signed?sig=abc");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/stops working on/)).toBeInTheDocument();
    await expectAccessible();
  });

  it("warns that making a document public is visible to everyone, and sends the reason", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/archive/${ID.document}`);
    await user.click(await screen.findByRole("button", { name: "Change visibility" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Visibility"), "public_document");
    expect(within(dialog).getByText(/visible to the public/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "Cleared by the source");
    await user.click(within(dialog).getByRole("button", { name: "Change visibility" }));
    expect(api.callsTo("POST", /classification$/)[0]?.body).toEqual({
      visibility: "public_document",
      reason: "Cleared by the source",
    });
  });

  it("hides classification from researchers", async () => {
    installEditorialApi({ user: STAFF.researcher });
    renderApp(`/editorial/archive/${ID.document}`);
    await screen.findByRole("heading", { level: 1, name: "Gauge spreadsheet" });
    expect(screen.queryByRole("button", { name: "Change visibility" })).not.toBeInTheDocument();
  });

  it("uploads a document as multipart form data with the CSRF header", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp(`/editorial/investigations/${ID.investigation}`);
    const input = await screen.findByLabelText("File");
    const file = new File(["a,b"], "readings.csv", { type: "text/csv" });
    await user.upload(input, file);
    await user.type(screen.getByLabelText("Description"), "Readings");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    const call = api.callsTo("POST", /\/documents$/)[0];
    expect(call?.body).toBeInstanceOf(FormData);
    const form = call?.body as FormData;
    expect((form.get("file") as File).name).toBe("readings.csv");
    expect(form.get("title")).toBe("readings.csv");
    expect(call?.headers.get("X-CSRF-Token")).toBeTruthy();
    expect(call?.headers.get("Content-Type")).toBeNull();
  });
});

describe("topics", () => {
  it("lists topics for editors and saves an edit", async () => {
    const api = installEditorialApi();
    const user = userEvent.setup();
    renderApp("/editorial/topics");
    expect(await screen.findByRole("heading", { name: "Environment" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name in English");
    await user.clear(name);
    await user.type(name, "Environment and water");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.callsTo("PATCH", /topics\/[^/]+$/)[0]?.body).toMatchObject({
      name_en: "Environment and water",
    });
    await expectAccessible();
  });
});

describe("staff accounts", () => {
  it("invites someone with chosen roles and shows the link once", async () => {
    const api = installEditorialApi({
      user: STAFF.admin,
      override: (call) =>
        call.method === "POST" && call.path === "/api/v1/admin/invites"
          ? {
              status: 201,
              body: {
                invite_id: "i1",
                email: "new@example.org",
                expires_at: "2026-03-08T10:00:00Z",
                token: "secret-token",
              },
            }
          : null,
    });
    const user = userEvent.setup();
    renderApp("/editorial/admin/users");
    await screen.findByRole("heading", { name: "Staff accounts", level: 1 });
    await user.type(screen.getByLabelText("Email address"), "new@example.org");
    await user.click(screen.getByLabelText("Editor", { selector: "#invite-role-editor" }));
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(api.callsTo("POST", /admin\/invites$/)[0]?.body).toEqual({
      email: "new@example.org",
      role_codes: ["researcher", "editor"],
    });
    expect(await screen.findByText(/activate\?token=secret-token/)).toBeInTheDocument();
    await expectAccessible();
  });

  it("asks for the email to be typed before disabling an account, and cannot disable yourself", async () => {
    const api = installEditorialApi({ user: STAFF.admin });
    const user = userEvent.setup();
    renderApp("/editorial/admin/users");
    await screen.findByRole("heading", { name: "Staff accounts", level: 1 });
    expect(screen.queryByRole("button", { name: "Disable Admin" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Disable Pema Researcher" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Disable" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Type researcher@example.org/), {
      target: { value: "researcher@example.org" },
    });
    await user.click(confirm);
    expect(api.callsTo("POST", /disable$/)).toHaveLength(1);
  });
});
