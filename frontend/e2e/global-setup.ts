import { chromium, type FullConfig } from "@playwright/test";

/**
 * Visit the main routes once before the tests. The Vite dev server optimises
 * dependencies on first use and reloads the page when it does, which would
 * otherwise make the first tests in a cold stack time out.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) {
    return;
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    for (const path of ["/en", "/en/fact-checks", "/en/submit", "/bo/about"]) {
      await page.goto(path, { waitUntil: "networkidle", timeout: 60_000 });
    }
  } finally {
    await browser.close();
  }
}
