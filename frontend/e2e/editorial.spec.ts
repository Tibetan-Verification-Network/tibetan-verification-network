import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

import { expect, expectNoAxeViolations, test } from "./fixtures";

/**
 * The whole non-AI editorial workflow, using only the interface: a public claim is triaged,
 * investigated, drafted in both languages (with an edit conflict), reviewed, approved, published,
 * corrected, and finally withdrawn. The three staff accounts come from `seed_e2e.py`.
 *
 * The steps depend on each other, so they run in order in one worker. Every run uses its own claim
 * text and slug, so the suite can be repeated against the same database.
 */

const PASSWORD = "correct-horse-battery-staple";
const STAFF = {
  author: { email: "e2e-author@example.org", name: "E2E Author" },
  editor: { email: "e2e-editor@example.org", name: "E2E Editor" },
  approver: { email: "e2e-approver@example.org", name: "E2E Approver" },
} as const;
type Role = keyof typeof STAFF;

const RUN = Date.now().toString(36);
const CLAIM = `E2E editorial claim ${RUN}: the glacier lake has dried up.`;
const SLUG = `e2e-ui-${RUN}`;
const SOURCE_TITLE = `Satellite survey ${RUN}`;

const ARTICLE = {
  en: {
    link: "English",
    title: `Has the glacier lake dried up? (${RUN})`,
    summary: "A post says the glacier lake has dried up.",
    claim: "The glacier lake has dried up.",
    context: "Shared in a community group.",
    explanation: "Satellite images show the lake is still full.",
    analysis: "Images from **three** seasons show a stable shoreline.",
    limitations: "Cloud cover hid one week.",
  },
  bo: {
    link: "བོད་ཡིག",
    title: `ཁྲོན་པ་ཆུ་མཚོ་སྐམ་སོང་ངམ། (${RUN})`,
    summary: "འཕྲིན་ཡིག་ཅིག་ལ་ཆུ་མཚོ་སྐམ་སོང་ཞེས་བཤད་འདུག",
    claim: "ཆུ་མཚོ་སྐམ་སོང་།",
    context: "ཚོགས་ཆུང་ཞིག་ནང་སྤེལ།",
    explanation: "ཟུར་འཁོར་པར་རིས་ལྟར་ཆུ་མཚོ་གང་ཡོད།",
    analysis: "དུས་ཚིགས་གསུམ་གྱི་པར་རིས་ལྟར་ཆུ་མཚམས་འགྱུར་མེད།",
    limitations: "ཟླ་ལྡན་གཅིག་མཐོང་མ་ཐུབ།",
  },
} as const;
type Language = keyof typeof ARTICLE;
const LANGUAGES: Language[] = ["en", "bo"];
/** The English title was edited during the conflict step. */
const publishedTitle = (language: Language) =>
  language === "en" ? `${ARTICLE.en.title} — clearer` : ARTICLE.bo.title;

interface Session {
  context: BrowserContext;
  page: Page;
}

const sessions = new Map<Role, Session>();
let investigationUrl = "";
let factCheckUrl = "";

async function signIn(browser: Browser, role: Role): Promise<Page> {
  const existing = sessions.get(role);
  if (existing) {
    return existing.page;
  }
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(STAFF[role].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/editorial/);
  sessions.set(role, { context, page });
  return page;
}

function notification(page: Page, text: string | RegExp): Locator {
  return page.locator(".notifications").getByText(text);
}

function dialog(page: Page): Locator {
  return page.getByRole("dialog");
}

async function openLanguage(page: Page, language: Language) {
  await page.goto(factCheckUrl);
  await page.getByRole("link", { name: ARTICLE[language].link, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
}

async function fillDraft(page: Page, language: Language) {
  const article = ARTICLE[language];
  await page.locator("#draft-title").fill(article.title);
  await page.locator("#draft-summary").fill(article.summary);
  await page.locator("#draft-verdict").selectOption("false");
  await page.locator("#draft-verdict-explanation").fill(article.explanation);
  await page.locator("#draft-claim").fill(article.claim);
  await page.locator("#draft-context").fill(article.context);
  await page.locator("#draft-analysis").fill(article.analysis);
  await page.locator("#draft-limitations").fill(article.limitations);
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(notification(page, "Draft saved.")).toBeVisible();
  await expect(page.getByText("You have unsaved changes.")).toHaveCount(0);
}

async function citeSource(page: Page) {
  await page.getByRole("button", { name: `Cite ${SOURCE_TITLE}` }).click();
  await page.getByRole("button", { name: "Save sources" }).click();
  await expect(notification(page, "Sources saved.")).toBeVisible();
}

async function submitForReview(page: Page) {
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(notification(page, "Submitted for review.")).toBeVisible();
}

async function markReady(page: Page) {
  await page.getByRole("button", { name: "Mark ready for approval" }).click();
  await dialog(page).getByRole("button", { name: "Mark ready for approval" }).click();
  await expect(notification(page, "Marked ready for approval.")).toBeVisible();
}

async function approveAndPublish(page: Page, correctionNote?: string) {
  await page.getByRole("button", { name: /^Approve revision \d+$/ }).click();
  const approving = dialog(page);
  await expect(approving).toContainText(/You approve revision \d+ of/);
  await approving.getByRole("button", { name: /^Approve revision \d+$/ }).click();
  await expect(notification(page, "Approved.")).toBeVisible();

  await page.getByRole("button", { name: "Review and publish" }).click();
  const publishing = dialog(page);
  await expect(publishing.getByRole("heading", { name: "What will be published" })).toBeVisible();
  await expect(publishing.getByText("Internal — never published")).toHaveCount(0);
  if (correctionNote) {
    await publishing.getByLabel("Correction note").fill(correctionNote);
  }
  await publishing.getByLabel(`Type ${SLUG} to confirm`).fill(SLUG);
  await publishing.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(notification(page, "Published.")).toBeVisible();
}

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("editorial workflow", () => {
  test.afterAll(async () => {
    for (const { context } of sessions.values()) {
      await context.close();
    }
    sessions.clear();
  });

  test("a public claim reaches the inbox and is triaged into an investigation", async ({
    page,
    browser,
  }) => {
    await page.goto("/en/submit");
    await page.getByRole("textbox", { name: "The claim", exact: true }).fill(CLAIM);
    await page.getByLabel("Where did you see it?").fill("A community group");
    await page.getByRole("button", { name: "Send claim" }).click();
    await expect(page.getByRole("heading", { name: "Thank you" })).toBeFocused();

    const editor = await signIn(browser, "editor");
    await editor.goto("/editorial/inbox");
    await expectNoAxeViolations(editor);
    await editor
      .getByRole("link", { name: new RegExp(RUN) })
      .first()
      .click();
    await expect(editor.getByRole("heading", { level: 1, name: "Submission" })).toBeVisible();
    await expect(editor.getByText("Internal — never published").first()).toBeVisible();

    await editor.getByRole("button", { name: "Reveal contact details" }).click();
    await expect(editor.getByText("The sender left no contact details.")).toBeVisible();
    await expectNoAxeViolations(editor);

    await editor.getByRole("button", { name: "Open investigation" }).click();
    await expect(dialog(editor)).toContainText("Starts an investigation");
    await expectNoAxeViolations(editor);
    await dialog(editor).getByRole("button", { name: "Open investigation" }).click();
    await expect(editor).toHaveURL(/\/editorial\/investigations\/[0-9a-f-]{36}$/);
    investigationUrl = new URL(editor.url()).pathname;
    await expect(editor.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("the editor assigns the team", async ({ browser }) => {
    const editor = await signIn(browser, "editor");
    await editor.goto(investigationUrl);
    for (const role of ["author", "approver"] as const) {
      await editor.getByLabel("Add a person").selectOption({ label: STAFF[role].name });
      await editor.getByRole("button", { name: "Assign" }).click();
      await expect(notification(editor, "Person assigned.").first()).toBeVisible();
    }
    await expectNoAxeViolations(editor);
  });

  test("the researcher records and verifies evidence", async ({ browser }) => {
    const author = await signIn(browser, "author");
    await author.goto(investigationUrl);

    const sources = author.getByRole("region", { name: "Sources" });
    await sources.getByRole("button", { name: "Add source" }).click();
    await expect(sources.getByRole("heading", { name: "Add source", level: 3 })).toBeVisible();
    await sources.getByLabel("Title", { exact: true }).fill(SOURCE_TITLE);
    await sources.getByLabel("Publisher").fill("Space Agency");
    await sources.getByLabel("Reliability notes").fill("Official imagery archive.");
    await sources.getByRole("button", { name: "Add source" }).last().click();
    await expect(notification(author, "Source saved.")).toBeVisible();

    const evidence = author.getByRole("region", { name: "Evidence" });
    await evidence.getByRole("button", { name: "Add evidence" }).click();
    await evidence.getByLabel("What it shows").selectOption("contradicts");
    await evidence.getByLabel("Excerpt").fill("The lake surface area is unchanged since 2020.");
    await evidence.getByLabel("Source", { exact: true }).selectOption({ label: SOURCE_TITLE });
    await evidence.getByRole("button", { name: "Add evidence" }).last().click();
    await expect(notification(author, "Evidence saved.")).toBeVisible();
    await expect(author.getByText("Not verified")).toBeVisible();

    await author.getByRole("button", { name: "Verify evidence 1" }).click();
    await expect(notification(author, "Evidence verified.")).toBeVisible();
    await expect(author.getByText(/Verified by/)).toBeVisible();
    await expectNoAxeViolations(author);
  });

  test("the researcher starts the fact-check and drafts both languages", async ({ browser }) => {
    const author = await signIn(browser, "author");
    await author.goto(investigationUrl);
    await author.getByRole("button", { name: "Start fact-check" }).click();
    await expect(dialog(author)).toContainText("frozen");
    await dialog(author).getByRole("button", { name: "Start fact-check" }).click();
    await expect(author).toHaveURL(/\/editorial\/factchecks\/[0-9a-f-]{36}$/);
    factCheckUrl = new URL(author.url()).pathname;

    await author.getByLabel("Public address (slug)").fill(SLUG);
    await author.getByRole("button", { name: "Save", exact: true }).click();
    await expect(notification(author, "Address saved.")).toBeVisible();
    await expectNoAxeViolations(author);

    for (const language of LANGUAGES) {
      await openLanguage(author, language);
      await fillDraft(author, language);
      await expect(author.getByText("You have unsaved changes.")).toBeVisible();
      await saveDraft(author);
      await citeSource(author);
    }
    await expectNoAxeViolations(author);
  });

  test("a concurrent edit is reported as a conflict and nothing typed is lost", async ({
    browser,
  }) => {
    // The same writer in two tabs. The editor must not touch the draft: someone who wrote a
    // revision cannot also mark it ready (the four-eyes rule), and later steps rely on that.
    const author = await signIn(browser, "author");
    const otherTab = await author.context().newPage();

    await openLanguage(author, "en");
    await openLanguage(otherTab, "en");

    await otherTab.locator("#draft-summary").fill("Summary improved in the other tab.");
    await saveDraft(otherTab);
    await otherTab.close();

    const mine = publishedTitle("en");
    await author.locator("#draft-title").fill(mine);
    await author.getByRole("button", { name: "Save draft" }).click();

    await expect(
      author.getByRole("alert").filter({ hasText: "Someone else saved this draft." }),
    ).toBeVisible();
    await expect(author.locator("#draft-title")).toHaveValue(mine);
    await expectNoAxeViolations(author);

    await author.getByRole("button", { name: "Keep my changes and save" }).click();
    await expect(notification(author, "Draft saved.")).toBeVisible();
    await expect(
      author.getByRole("alert").filter({ hasText: "Someone else saved this draft." }),
    ).toHaveCount(0);
    await expect(author.locator("#draft-title")).toHaveValue(mine);
    await expect(author.locator("#draft-summary")).toHaveValue(
      "Summary improved in the other tab.",
    );

    await author.reload();
    await expect(author.locator("#draft-title")).toHaveValue(mine);
  });

  for (const language of LANGUAGES) {
    test(`the ${language} draft goes through review, approval and publication`, async ({
      browser,
    }) => {
      const author = await signIn(browser, "author");
      const editor = await signIn(browser, "editor");
      const approver = await signIn(browser, "approver");

      await openLanguage(author, language);
      if (language !== LANGUAGES[0]) {
        // Readiness: once one language is live, the other must say what its translation status is.
        await author.locator("#draft-translation").selectOption("unavailable");
        await saveDraft(author);
      }
      await submitForReview(author);

      await openLanguage(editor, language);
      await editor.getByLabel("Add a comment").fill("Checked the sources against the survey.");
      await editor.getByRole("button", { name: "Add comment" }).click();
      await expect(notification(editor, "Comment added.")).toBeVisible();
      await expectNoAxeViolations(editor);
      await markReady(editor);

      await approver.goto("/editorial/approvals");
      await expect(approver.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoAxeViolations(approver);
      await openLanguage(approver, language);
      await expectNoAxeViolations(approver);
      await approveAndPublish(approver);
    });
  }

  test("readers see both languages", async ({ page }) => {
    for (const language of LANGUAGES) {
      await page.goto(`/${language}/fact-checks/${SLUG}`);
      await expect(
        page.getByRole("heading", { level: 1, name: publishedTitle(language) }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    }
  });

  test("the published version history shows a verified checksum", async ({ browser }) => {
    const editor = await signIn(browser, "editor");
    await openLanguage(editor, "en");
    const versions = editor.getByRole("region", { name: "Published versions" });
    await expect(versions.getByText("Version 1")).toBeVisible();
    await expect(versions.getByText("Checksum matches")).toBeVisible();
    await versions.getByRole("button", { name: "View" }).first().click();
    await expect(versions.getByText(ARTICLE.en.explanation)).toBeVisible();
    await expectNoAxeViolations(editor);
  });

  test("a correction is drafted, reviewed and published as a new public version", async ({
    browser,
  }) => {
    const author = await signIn(browser, "author");
    const editor = await signIn(browser, "editor");
    const approver = await signIn(browser, "approver");
    const note = "Added the survey date.";

    await openLanguage(approver, "en");
    await approver.getByRole("button", { name: "Start a correction" }).click();
    await dialog(approver).getByLabel("Why is this needed?").fill("The survey date was missing.");
    await dialog(approver).getByRole("button", { name: "Start a correction" }).click();
    await expect(notification(approver, "Correction started.")).toBeVisible();

    await openLanguage(author, "en");
    await author.locator("#draft-limitations").fill(`${ARTICLE.en.limitations} Survey: March.`);
    // The English text was published while its translation status was still "pending".
    await author.locator("#draft-translation").selectOption("unavailable");
    await saveDraft(author);
    await submitForReview(author);

    await openLanguage(editor, "en");
    await markReady(editor);

    await openLanguage(approver, "en");
    await approveAndPublish(approver, note);

    await approver.goto(`/en/fact-checks/${SLUG}`);
    await expect(approver.getByText(note).first()).toBeVisible();
    await expectNoAxeViolations(approver);
  });

  test("only the approver can withdraw, and readers then see a notice", async ({
    browser,
    page,
  }) => {
    const editor = await signIn(browser, "editor");
    const approver = await signIn(browser, "approver");

    await openLanguage(editor, "en");
    await expect(editor.getByRole("button", { name: "Withdraw" })).toHaveCount(0);

    for (const language of LANGUAGES) {
      await openLanguage(approver, language);
      await approver.getByRole("button", { name: "Withdraw" }).click();
      const withdrawing = dialog(approver);
      await withdrawing.getByLabel("Public notice").fill("Withdrawn while the survey is redone.");
      await withdrawing.getByLabel("Internal reason").fill("Seeded e2e withdrawal.");
      await expect(withdrawing.getByRole("button", { name: "Withdraw" })).toBeDisabled();
      await withdrawing.getByLabel(`Type ${SLUG} to confirm`).fill(SLUG);
      await withdrawing.getByRole("button", { name: "Withdraw" }).click();
      await expect(notification(approver, "Withdrawn.")).toBeVisible();
    }

    // A fresh browser: the approver's own browser may hold the live article in its HTTP cache.
    await page.goto(`/en/fact-checks/${SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "This fact-check has been withdrawn" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("hidden controls are not a boundary: a researcher gets the same answer as a missing page", async ({
    browser,
  }) => {
    const author = await signIn(browser, "author");
    for (const path of ["/editorial/approvals", "/editorial/topics", "/editorial/admin/users"]) {
      await author.goto(path);
      await expect(
        author.getByText("This was not found, or you do not have access to it."),
      ).toBeVisible();
    }
    // Straight to the API, as a script would: the session cookie is shared across ports.
    const web = new URL(String(test.info().project.use.baseURL));
    const apiBase = process.env.E2E_API_URL ?? `${web.protocol}//${web.hostname}:8000`;
    const response = await author.request.get(`${apiBase}/api/v1/admin/users`);
    expect([403, 404]).toContain(response.status());
  });
});
