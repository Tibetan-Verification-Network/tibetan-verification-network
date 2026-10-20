import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { I18nProvider } from "./I18nProvider";
import { bo } from "./locales/bo";
import { en, publicEn } from "./locales/en";
import { LOCALE_STORAGE_KEY } from "./storage";
import { chooseLocale, messageOrFallback, translate } from "./translate";
import { installAnonymousApi } from "../test/fetch";
import { renderApp } from "../test/renderApp";

describe("locale catalogs", () => {
  it("keeps the product name and covers the same keys in both languages", () => {
    expect(en["product.name"]).toBe("Tibetan Verification Network");
    expect(bo["product.name"]).toBe("Tibetan Verification Network");
    expect(Object.keys(bo).sort()).toEqual(Object.keys(publicEn).sort());
    expect(JSON.stringify(en)).not.toContain("Tibetan FactCheck");
    expect(JSON.stringify(bo)).not.toContain("Tibetan FactCheck");
  });

  it("shows staff-area copy in English until a Tibetan translation exists", () => {
    expect(Object.keys(en).length).toBeGreaterThan(Object.keys(publicEn).length);
    expect(translate("bo", "review.title")).toBe(en["review.title"]);
    expect(translate("bo", "approve.button", { revision: "3" })).toBe("Approve revision 3");
  });

  it("falls back to English when a translation is missing or blank", () => {
    expect(messageOrFallback(undefined, "Hello")).toBe("Hello");
    expect(messageOrFallback("   ", "Hello")).toBe("Hello");
    expect(messageOrFallback("བོད་ཡིག", "Hello")).toBe("བོད་ཡིག");
  });

  it("prefers a stored locale, then Tibetan in the browser languages, then English", () => {
    expect(chooseLocale("bo", ["en-US"])).toBe("bo");
    expect(chooseLocale("en", ["bo"])).toBe("en");
    expect(chooseLocale(null, ["bo-IN", "en"])).toBe("bo");
    expect(chooseLocale("zh", ["fr-FR"])).toBe("en");
  });
});

describe("language switcher", () => {
  it("switches to Tibetan, persists the choice, and restores it", async () => {
    installAnonymousApi();
    const user = userEvent.setup();
    const first = renderApp("/");
    expect(document.documentElement.lang).toBe("en");

    await user.click(screen.getByRole("button", { name: "བོད་ཡིག" }));

    expect(document.documentElement.lang).toBe("bo");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("bo");
    expect(screen.getByRole("button", { name: "བོད་ཡིག" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(bo["home.lede"])).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/[\u0f00-\u0fff]/);
    first.unmount();

    renderApp("/");
    expect(document.documentElement.lang).toBe("bo");
    expect(screen.getByText(bo["home.lede"])).toBeInTheDocument();
  });

  it("changes language from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <MemoryRouter>
          <LanguageSwitcher />
        </MemoryRouter>
      </I18nProvider>,
    );
    const tibetan = screen.getByRole("button", { name: "བོད་ཡིག" });
    tibetan.focus();
    await user.keyboard("{Enter}");
    expect(document.documentElement.lang).toBe("bo");
    screen.getByRole("button", { name: "English" }).focus();
    await user.keyboard(" ");
    expect(document.documentElement.lang).toBe("en");
  });
});
