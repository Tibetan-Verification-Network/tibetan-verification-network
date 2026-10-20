import { expect, expectNoAxeViolations, PENDING, RIVER, test, WITHDRAWN } from "./fixtures";

test.describe("public site", () => {
  test("redirects the root to a locale and keeps the page accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(en|bo)$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("searches fact-checks and filters by verdict", async ({ page }) => {
    await page.goto("/en/fact-checks");
    await expect(page.getByRole("link", { name: RIVER.titleEn })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("searchbox", { name: "Search" }).fill("river");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=river/);
    await expect(page.getByRole("link", { name: RIVER.titleEn })).toBeVisible();
    await expect(page.getByRole("link", { name: PENDING.titleEn })).toHaveCount(0);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByRole("combobox", { name: "Verdict" }).selectOption("misleading");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/verdict=misleading/);
    await expect(page.getByRole("link", { name: PENDING.titleEn })).toBeVisible();
    await expect(page.getByRole("link", { name: RIVER.titleEn })).toHaveCount(0);
  });

  test("shows an empty state when nothing matches", async ({ page }) => {
    await page.goto("/en/fact-checks?q=zzzznomatchzzzz");
    await expect(page.getByText("No fact-checks match these filters.")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("opens and reads a fact-check from search", async ({ page }) => {
    await page.goto("/en/fact-checks");
    await page.getByRole("link", { name: RIVER.titleEn }).click();
    await expect(page).toHaveURL(new RegExp(`/en/fact-checks/${RIVER.slug}$`));
    await expect(page.getByRole("heading", { level: 1, name: RIVER.titleEn })).toBeVisible();
    await expect(page.getByText("The river stops flowing every winter.").first()).toBeVisible();
    await expect(
      page.getByText("Gauge records show continuous flow in every month."),
    ).toBeVisible();
    await expect(page.locator("strong", { hasText: "every" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("switches to the Tibetan translation of the same fact-check", async ({ page }) => {
    await page.goto(`/en/fact-checks/${RIVER.slug}`);
    await page.getByRole("button", { name: "བོད་ཡིག" }).click();
    await expect(page).toHaveURL(new RegExp(`/bo/fact-checks/${RIVER.slug}$`));
    await expect(page.getByRole("heading", { level: 1, name: RIVER.titleBo })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "bo");
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "English" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/fact-checks/${RIVER.slug}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("shows a pending notice instead of a missing translation", async ({ page }) => {
    await page.goto(`/en/fact-checks/${PENDING.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: PENDING.titleEn })).toBeVisible();
    await page.getByRole("button", { name: "བོད་ཡིག" }).click();
    await expect(page).toHaveURL(new RegExp(`/bo/fact-checks/${PENDING.slug}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "bo");
    const englishLink = page.getByRole("link", { name: /English/ });
    await expect(englishLink).toHaveAttribute("href", `/en/fact-checks/${PENDING.slug}`);
    await expectNoAxeViolations(page);

    await englishLink.click();
    await expect(page.getByRole("heading", { level: 1, name: PENDING.titleEn })).toBeVisible();
  });

  test("shows only the notice for a withdrawn fact-check", async ({ page }) => {
    await page.goto(`/en/fact-checks/${WITHDRAWN.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "This fact-check has been withdrawn" }),
    ).toBeVisible();
    await expect(page.getByText("The festival was cancelled.")).toHaveCount(0);
    await expect(page.getByText("The only source was later retracted.")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sources" })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("shows a not-found page for an unknown fact-check", async ({ page }) => {
    await page.goto("/en/fact-checks/e2e-does-not-exist");
    await expect(page.getByRole("heading", { name: "Fact-check not found" })).toBeVisible();
  });

  test("lists topics and their fact-checks", async ({ page }) => {
    await page.goto("/en/topics");
    await expect(page.getByRole("heading", { level: 1, name: "Topics" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("shows the about page in both locales", async ({ page }) => {
    for (const locale of ["en", "bo"]) {
      await page.goto(`/${locale}/about`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expectNoAxeViolations(page);
    }
  });

  test("submits a claim and shows a success state", async ({ page }) => {
    await page.goto("/en/submit");
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Send claim" }).click();
    const summary = page.getByRole("alert");
    await expect(summary).toContainText("Enter the claim, with at least 10 characters.");
    await expectNoAxeViolations(page);

    await page
      .getByRole("textbox", { name: "The claim", exact: true })
      .fill("The river stops flowing every winter, says a post.");
    await page.getByLabel("Where did you see it?").fill("A community group");
    await page.getByRole("button", { name: "Send claim" }).click();

    await expect(page.getByRole("heading", { name: "Thank you" })).toBeFocused();
    await expect(page.locator("body")).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    await expectNoAxeViolations(page);
  });
});
