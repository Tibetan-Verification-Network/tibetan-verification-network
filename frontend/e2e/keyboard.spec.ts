import { expect, expectNoAxeViolations, RIVER, test } from "./fixtures";

test.describe("keyboard navigation", () => {
  test("submits a claim using the keyboard only", async ({ page }) => {
    await page.goto("/en/submit");
    await expectNoAxeViolations(page);

    await page.keyboard.press("Tab");
    await page.keyboard.type("The river stops flowing every winter, says a post.");
    await page.keyboard.press("Tab");
    await page.keyboard.type("A community group");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "Thank you" })).toBeFocused();
  });

  test("opens a fact-check from search with the keyboard", async ({ page }) => {
    await page.goto("/en/fact-checks");
    await page.getByRole("searchbox", { name: "Search" }).focus();
    await page.keyboard.type("river");
    await page.getByRole("button", { name: "Search" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=river/);

    await page.getByRole("link", { name: RIVER.titleEn }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: RIVER.titleEn })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
