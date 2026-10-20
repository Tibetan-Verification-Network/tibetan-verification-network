import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nProvider";
import { expectAccessible } from "../test/a11y";
import { ConfirmDialog } from "./components/ConfirmDialog";

function Harness({ onConfirm = vi.fn(), typed }: { onConfirm?: () => void; typed?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <I18nProvider>
      <div id="root">
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </div>
      {open ? (
        <ConfirmDialog
          title="Publish"
          consequence="This becomes public."
          confirmLabel="Publish now"
          {...(typed === undefined ? {} : { typedConfirmation: typed })}
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </I18nProvider>
  );
}

describe("ConfirmDialog", () => {
  it("is a labelled modal that states its consequence and is accessible", async () => {
    document.title = "Test";
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Publish" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This becomes public.");
    expect(document.getElementById("root")).toHaveAttribute("inert");
    await expectAccessible();
  });

  it("keeps Tab inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const confirm = screen.getByRole("button", { name: "Publish now" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it("closes on Escape, restores focus and removes the inert page", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.getElementById("root")).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("does not confirm until the exact text is typed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness typed="river-claim" onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const confirm = screen.getByRole("button", { name: "Publish now" });
    const field = screen.getByLabelText("Type river-claim to confirm");
    await user.type(field, "river-clai");
    expect(confirm).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    await user.type(field, "m");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
