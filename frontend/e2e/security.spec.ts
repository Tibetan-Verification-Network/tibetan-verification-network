import { expect, test } from "./fixtures";

/** Strings that must never appear on the public site or public read API. */
const FORBIDDEN_IN_PUBLIC = [
  "CANARY-LEAK-",
  "internal_reason",
  "submitter_key_hash",
  "review_comment",
  "storage_key",
  "e2e-author@example.org",
  "e2e-editor@example.org",
  "e2e-approver@example.org",
  "correct-horse-battery-staple",
];

const PUBLIC_PAGES = [
  "/en",
  "/bo",
  "/en/fact-checks",
  "/bo/fact-checks",
  "/en/topics",
  "/bo/topics",
  "/en/about",
  "/bo/about",
  "/en/submit",
  "/bo/submit",
  "/en/fact-checks/e2e-river",
  "/bo/fact-checks/e2e-river",
  "/en/fact-checks/e2e-withdrawn",
];

test.describe("public and private separation", () => {
  test("public pages do not expose staff or internal markers", async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const text = (await page.locator("body").innerText()).toLowerCase();
      for (const marker of FORBIDDEN_IN_PUBLIC) {
        expect(text, path).not.toContain(marker.toLowerCase());
      }
    }
  });

  test("public read API responses stay free of internal markers", async ({ request }) => {
    const apiBase = process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
    const paths = [
      "/api/v1/factchecks?lang=en&limit=50",
      "/api/v1/factchecks/e2e-river?lang=en",
      "/api/v1/factchecks/e2e-river?lang=bo",
      "/api/v1/topics",
    ];
    for (const path of paths) {
      const response = await request.get(`${apiBase}${path}`);
      expect(response.ok(), path).toBeTruthy();
      const blob = JSON.stringify(await response.json()).toLowerCase();
      for (const marker of FORBIDDEN_IN_PUBLIC) {
        expect(blob, path).not.toContain(marker.toLowerCase());
      }
    }
  });

  test("guessed slugs and editorial routes are not public", async ({ page, request }) => {
    const apiBase = process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
    const draftSlug = await request.get(`${apiBase}/api/v1/factchecks/e2e-does-not-exist?lang=en`);
    expect(draftSlug.status()).toBe(404);

    await page.goto("/editorial");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/editorial/inbox");
    await expect(page).toHaveURL(/\/login/);
  });
});
