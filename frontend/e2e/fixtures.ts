import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

/** Content created by `backend/scripts/seed_e2e.py`. */
export const RIVER = {
  slug: "e2e-river",
  titleEn: "E2E river flow claim",
  titleBo: "ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།",
};
export const PENDING = {
  slug: "e2e-pending",
  titleEn: "E2E claim awaiting translation",
};
export const WITHDRAWN = {
  slug: "e2e-withdrawn",
  titleEn: "E2E withdrawn claim",
};

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

export const test = base;
export { expect };
