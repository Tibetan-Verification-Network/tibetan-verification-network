import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { bo } from "../i18n/locales/bo";
import { LOCALE_STORAGE_KEY } from "../i18n/storage";
import { expectAccessible } from "../test/a11y";
import { defaultDataset, installFetch, installPublicApi, requestUrl } from "../test/fetch";
import { makeCard, makeDetail, makeSnapshot } from "../test/fixtures";
import { renderApp } from "../test/renderApp";

const RIVER_TITLE = "Does the river run dry every winter?";

function fetchedUrls(fetchMock: ReturnType<typeof installPublicApi>): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(requestUrl(input as RequestInfo | URL)));
}

describe("locale routing", () => {
  it("redirects unprefixed public paths using the stored locale", async () => {
    installPublicApi();
    localStorage.setItem(LOCALE_STORAGE_KEY, "bo");
    renderApp("/fact-checks");
    expect(await screen.findByRole("heading", { name: bo["search.title"] })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("bo");
  });

  it("falls back to the browser language and then English", async () => {
    installPublicApi();
    renderApp("/about");
    expect(await screen.findByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("follows the URL prefix over the stored preference", async () => {
    installPublicApi();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    renderApp("/bo/about");
    expect(await screen.findByRole("heading", { name: bo["about.title"] })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("bo");
  });

  it("shows not found for unknown prefixed and unprefixed paths", async () => {
    installPublicApi();
    const first = renderApp("/en/nope");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    first.unmount();
    renderApp("/fr/fact-checks");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("home page", () => {
  it("shows a short introduction, search, and the membership banner", async () => {
    installPublicApi();
    renderApp("/en");
    expect(
      await screen.findByRole("heading", {
        name: "A Resilient and Trusted Tibetan Information Ecosystem",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Evidence-based · Human-reviewed")).toBeInTheDocument();
    expect(
      screen.getByText("Built by Tibetans, for Tibetans. Verified by people, empowered by AI."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Independent fact-checks" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Our mission" })).not.toBeInTheDocument();
    expect(screen.queryByText(RIVER_TITLE)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign me up" })).toHaveAttribute(
      "href",
      "/en/membership",
    );
    expect(screen.getByRole("search", { name: "Search fact-checks" })).toBeInTheDocument();
    const submitLinks = screen.getAllByRole("link", { name: "Submit a claim" });
    expect(submitLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of submitLinks) {
      expect(link).toHaveAttribute("href", "/en/submit");
    }
    expect(screen.getByRole("link", { name: "Corrections policy" })).toHaveAttribute(
      "href",
      "/en/about#corrections",
    );
    expect(screen.queryByText(/API status/)).not.toBeInTheDocument();
    await expectAccessible();
  });

  it("lists fact-checks for the active language on the search page", async () => {
    const fetchMock = installPublicApi();
    renderApp("/bo/fact-checks");
    await waitFor(() => {
      expect(fetchedUrls(fetchMock).some((url) => url.searchParams.get("lang") === "bo")).toBe(
        true,
      );
    });
    expect(await screen.findByText("ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།")).toBeInTheDocument();
    expect(screen.queryByText(RIVER_TITLE)).not.toBeInTheDocument();
    await expectAccessible();
  });

  it("goes to the search page with the typed query", async () => {
    const fetchMock = installPublicApi();
    const user = userEvent.setup();
    renderApp("/en");
    await user.type(await screen.findByRole("searchbox", { name: "Search fact-checks" }), "river");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "Fact-checks" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchedUrls(fetchMock).some((url) => url.searchParams.get("q") === "river")).toBe(
        true,
      );
    });
  });
});

describe("search page", () => {
  it("lists result cards that link to the article in their own language", async () => {
    const fetchMock = installPublicApi();
    renderApp("/en/fact-checks");
    const link = await screen.findByRole("link", { name: RIVER_TITLE });
    expect(link).toHaveAttribute("href", "/en/fact-checks/river-claim");
    const listCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).includes("/api/v1/factchecks"),
    );
    expect(listCall).toBeDefined();
    expect((listCall?.[1] as RequestInit).credentials).toBe("omit");
    expect(screen.getByRole("status")).toHaveTextContent("2 fact-checks shown");
    expect(screen.getAllByText("False").length).toBeGreaterThan(0);
    await expectAccessible();
  });

  it("applies filters from the URL and from the form", async () => {
    const fetchMock = installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/fact-checks?verdict=misleading&lang=all&from=2026-01-01&to=2026-02-01");
    expect(await screen.findByText("A claim with no Tibetan translation yet")).toBeInTheDocument();
    const initial = fetchedUrls(fetchMock).find((url) => url.pathname === "/api/v1/factchecks");
    expect(initial?.searchParams.get("verdict")).toBe("misleading");
    expect(initial?.searchParams.has("lang")).toBe(false);
    expect(initial?.searchParams.get("from")).toBe("2026-01-01T00:00:00Z");
    expect(initial?.searchParams.get("to")).toBe("2026-02-01T23:59:59Z");
    expect(screen.getByRole("combobox", { name: "Verdict" })).toHaveValue("misleading");

    await user.selectOptions(screen.getByRole("combobox", { name: "Verdict" }), "false");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "en");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("link", { name: RIVER_TITLE })).toBeInTheDocument();
    expect(screen.queryByText("A claim with no Tibetan translation yet")).not.toBeInTheDocument();
  });

  it("clears filters", async () => {
    installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/fact-checks?verdict=false");
    expect(await screen.findByRole("link", { name: RIVER_TITLE })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("A claim with no Tibetan translation yet")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Verdict" })).toHaveValue("");
  });

  it("loads more results on request and announces the count", async () => {
    const cards = Array.from({ length: 25 }, (_, index) =>
      makeCard({
        slug: `claim-${index}`,
        title: `Claim number ${index}`,
        last_published_at: `2026-01-${String(25 - index).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    installPublicApi({ cards });
    const user = userEvent.setup();
    renderApp("/en/fact-checks");
    expect(await screen.findByText("Claim number 0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("20 fact-checks shown");
    expect(screen.queryByText("Claim number 24")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Claim number 24")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("25 fact-checks shown");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    installPublicApi({ cards: [] });
    renderApp("/en/fact-checks?q=zzz");
    expect(await screen.findByText("No fact-checks match these filters.")).toBeInTheDocument();
    await expectAccessible();
  });

  it("shows an error state with a retry control", async () => {
    let failing = true;
    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      if (url.includes("/api/v1/topics")) {
        return { status: 200, body: { items: [] } };
      }
      if (failing) {
        return { status: 500, body: { detail: "boom" } };
      }
      return { status: 200, body: { items: [makeCard()], next_cursor: null } };
    });
    const user = userEvent.setup();
    renderApp("/en/fact-checks");
    expect(await screen.findByText("Fact-checks could not be loaded.")).toBeInTheDocument();
    await expectAccessible();
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: RIVER_TITLE })).toBeInTheDocument();
  });

  it("is accessible in Tibetan", async () => {
    installPublicApi();
    renderApp("/bo/fact-checks");
    expect(await screen.findByText("ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("bo");
    await expectAccessible();
  });
});

describe("article page", () => {
  it("renders the PRD sections in order with the verdict badge linked to its definition", async () => {
    installPublicApi();
    renderApp("/en/fact-checks/river-claim");
    expect(await screen.findByRole("heading", { level: 1, name: RIVER_TITLE })).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Why this verdict",
      "The claim",
      "Context",
      "Analysis",
      "Limitations",
      "Sources",
      "Version and correction history",
      "Translation",
    ]);
    const badge = screen.getByRole("link", { name: /Verdict: False/ });
    expect(badge).toHaveAttribute("href", "/en/about#verdict-false");
    expect(screen.getByText("Gauge records show continuous flow.")).toBeInTheDocument();
    expect(
      screen.getByText("Researched and reviewed by the Tibetan Verification Network."),
    ).toBeInTheDocument();
    expect(screen.getByText("Published January 5, 2026")).toBeInTheDocument();

    const source = screen.getByRole("link", { name: "River gauge report" });
    expect(source).toHaveAttribute("href", "https://example.org/report");
    expect(source).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("Hydrology Office")).toBeInTheDocument();
    expect(screen.getByText("Primary flow data")).toBeInTheDocument();
    await expectAccessible();
  });

  it("sets the language of the article content", async () => {
    installPublicApi();
    renderApp("/bo/fact-checks/river-claim");
    const title = await screen.findByRole("heading", { level: 1 });
    expect(title).toHaveAttribute("lang", "bo");
    expect(title).toHaveTextContent("ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།");
    await expectAccessible();
  });

  it("sanitizes server HTML again before rendering it", async () => {
    const evil = makeSnapshot({
      analysis_html:
        '<p>Safe text</p><script>window.__pwned = true</script><img src=x onerror="window.__pwned = true"><a href="javascript:alert(1)">bad</a><a href="https://example.org/ok">ok</a>',
    });
    installPublicApi({ details: { "river-claim": { en: makeDetail(evil) } } });
    renderApp("/en/fact-checks/river-claim");
    expect(await screen.findByText("Safe text")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("#article-analysis img")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(screen.getByText("bad").getAttribute("href")).toBeNull();
    const ok = screen.getByRole("link", { name: "ok" });
    expect(ok).toHaveAttribute("rel", "nofollow noopener noreferrer");
  });

  it("shows the correction note and version history, with links to prior versions", async () => {
    installPublicApi();
    renderApp("/en/fact-checks/corrected-claim");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "A corrected fact-check",
    );
    expect(screen.getAllByText("Fixed the year of the first report.").length).toBe(2);
    expect(screen.getByText(/Correction:/)).toBeInTheDocument();
    expect(screen.getByText("Last updated February 20, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View version 1" })).toHaveAttribute(
      "href",
      "/en/fact-checks/corrected-claim/versions/1",
    );
    expect(screen.queryByRole("link", { name: "View version 2" })).not.toBeInTheDocument();
    expect(screen.getByText(/\(Current version\)/)).toBeInTheDocument();
  });

  it("shows a prior version with a link back to the current one", async () => {
    installPublicApi();
    renderApp("/en/fact-checks/corrected-claim/versions/1");
    expect(await screen.findByText(/You are reading version 1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the current version" })).toHaveAttribute(
      "href",
      "/en/fact-checks/corrected-claim",
    );
    await expectAccessible();
  });

  it("shows not found for unknown versions and slugs", async () => {
    installPublicApi();
    const first = renderApp("/en/fact-checks/corrected-claim/versions/9");
    expect(
      await screen.findByRole("heading", { name: "Fact-check not found" }),
    ).toBeInTheDocument();
    first.unmount();
    const second = renderApp("/en/fact-checks/guessed-slug");
    expect(
      await screen.findByRole("heading", { name: "Fact-check not found" }),
    ).toBeInTheDocument();
    await expectAccessible();
    second.unmount();
    renderApp("/en/fact-checks/corrected-claim/versions/abc");
    expect(
      await screen.findByRole("heading", { name: "Fact-check not found" }),
    ).toBeInTheDocument();
  });

  it("shows the withdrawal notice only, never the withdrawn body", async () => {
    installPublicApi();
    renderApp("/en/fact-checks/withdrawn-claim");
    expect(
      await screen.findByRole("heading", { level: 1, name: "This fact-check has been withdrawn" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Withdrawn because a source was retracted.")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn on March 1, 2026")).toBeInTheDocument();
    expect(screen.queryByText("The river stops flowing every winter.")).not.toBeInTheDocument();
    expect(screen.queryByText("Gauge records show continuous flow.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sources" })).not.toBeInTheDocument();
    await expectAccessible();
  });

  it("links to the translation when it is published", async () => {
    installPublicApi();
    renderApp("/en/fact-checks/river-claim");
    const link = await screen.findByRole("link", { name: "Read this fact-check in བོད་ཡིག" });
    expect(link).toHaveAttribute("href", "/bo/fact-checks/river-claim");
  });

  it("says the translation is pending when only the other language exists", async () => {
    installPublicApi();
    renderApp("/en/fact-checks/pending-claim");
    expect(
      await screen.findByText("The བོད་ཡིག translation of this fact-check is pending."),
    ).toBeInTheDocument();
  });

  it("switches the language of a pending article to a pending notice that links back", async () => {
    installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/fact-checks/pending-claim");
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "བོད་ཡིག" }));

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("སྒུག་བཞིན་པ།");
    expect(document.documentElement.lang).toBe("bo");
    const link = screen.getByRole("link", { name: /English/ });
    expect(link).toHaveAttribute("href", "/en/fact-checks/pending-claim");
    expect(screen.getByText("A claim with no Tibetan translation yet")).toHaveAttribute(
      "lang",
      "en",
    );
    await expectAccessible();
  });

  it("switches language to a published translation on the same slug", async () => {
    installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/fact-checks/river-claim");
    await screen.findByRole("heading", { level: 1, name: RIVER_TITLE });
    await user.click(screen.getByRole("button", { name: "བོད་ཡིག" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།" }),
    ).toBeInTheDocument();
  });

  it("says the translation is unavailable when it was never planned", async () => {
    const base = defaultDataset();
    const entry = base.details["pending-claim"]?.en;
    if (entry === undefined) {
      throw new Error("fixture missing");
    }
    installPublicApi({
      details: {
        "pending-claim": {
          en: {
            ...entry,
            translations: [
              { language: "en", status: "published", slug: "pending-claim" },
              { language: "bo", status: "unavailable", slug: "pending-claim" },
            ],
          },
        },
      },
    });
    const user = userEvent.setup();
    renderApp("/en/fact-checks/pending-claim");
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "བོད་ཡིག" }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("མེད།");
  });
});

describe("topics", () => {
  it("lists topics with counts for the active language", async () => {
    installPublicApi();
    renderApp("/en/topics");
    const link = await screen.findByRole("link", { name: "Environment" });
    expect(link).toHaveAttribute("href", "/en/topics/environment");
    expect(screen.getByText("2 fact-checks")).toBeInTheDocument();
    await expectAccessible();
  });

  it("shows a topic page with recent fact-checks and a link to the filtered search", async () => {
    installPublicApi();
    renderApp("/en/topics/environment");
    expect(await screen.findByRole("heading", { level: 1, name: "Environment" })).toBeVisible();
    expect(await screen.findByRole("link", { name: RIVER_TITLE })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all fact-checks on this topic" }),
    ).toHaveAttribute("href", "/en/fact-checks?topic=environment");
    await expectAccessible();
  });

  it("shows a topic page in Tibetan, falling back to English text for missing copy", async () => {
    installPublicApi();
    renderApp("/bo/topics/environment");
    expect(await screen.findByRole("heading", { level: 1, name: "ཁོར་ཡུག" })).toBeVisible();
    expect(screen.getByText("Claims about land, water, and climate.")).toBeInTheDocument();
    await expectAccessible();
  });

  it("shows not found for an unknown topic", async () => {
    installPublicApi();
    renderApp("/en/topics/nothing");
    expect(await screen.findByRole("heading", { name: "Topic not found" })).toBeInTheDocument();
  });
});

describe("about page", () => {
  it("covers mission, methodology, verdict definitions, and corrections in both languages", async () => {
    installPublicApi();
    const first = renderApp("/en/about");
    for (const name of ["Mission", "Methodology", "What our verdicts mean", "Corrections policy"]) {
      expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    }
    for (const label of ["True", "False", "Misleading", "Unverified", "Unclear"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    await expectAccessible();
    first.unmount();

    renderApp("/bo/about");
    for (const key of [
      "about.mission.title",
      "about.methodology.title",
      "about.verdicts.title",
      "about.corrections.title",
    ] as const) {
      expect(await screen.findByRole("heading", { name: bo[key] })).toBeInTheDocument();
    }
    await expectAccessible();
  });
});

describe("submit page", () => {
  async function fillClaim(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.type(await screen.findByLabelText("The claim"), text);
  }

  it("is accessible in both languages and states the no-guarantee and privacy text", async () => {
    installPublicApi();
    const first = renderApp("/en/submit");
    expect(await screen.findByRole("heading", { name: "Submit a claim" })).toBeInTheDocument();
    expect(screen.getByText(/does not guarantee that we will investigate/)).toBeInTheDocument();
    expect(screen.getByText(/Privacy notice:/)).toBeInTheDocument();
    await expectAccessible();
    first.unmount();

    renderApp("/bo/submit");
    expect(await screen.findByRole("heading", { name: bo["submit.title"] })).toBeInTheDocument();
    await expectAccessible();
  });

  it("explains validation problems through the error summary and field errors", async () => {
    const fetchMock = installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/submit");
    await fillClaim(user, "short");
    await user.type(screen.getByLabelText("Link to the claim"), "ftp://example.org");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send claim" }));

    const summary = await screen.findByRole("alert");
    expect(within(summary).getByText("Correct the following")).toHaveFocus();
    expect(
      within(summary).getByRole("link", { name: "Enter the claim, with at least 10 characters." }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("link", {
        name: "Enter a web address that starts with http:// or https://.",
      }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("link", {
        name: "Agree to the use of your contact details, or remove them.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("The claim")).toHaveAttribute("aria-invalid", "true");
    expect(fetchedUrls(fetchMock).some((url) => url.pathname === "/api/v1/submissions")).toBe(
      false,
    );
    await expectAccessible();
  });

  it("sends the submission and shows a success state without internal identifiers", async () => {
    const fetchMock = installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/submit");
    await fillClaim(user, "The river stops flowing every winter.");
    await user.type(screen.getByLabelText("Where did you see it?"), "A community group");
    await user.type(screen.getByLabelText("Link to the claim"), "https://example.org/post");
    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.click(screen.getByLabelText(/I agree that the team may use my contact details/));
    await user.click(screen.getByRole("button", { name: "Send claim" }));

    expect(await screen.findByRole("heading", { name: "Thank you" })).toHaveFocus();
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(document.body.textContent).not.toContain("receipt");

    const call = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).endsWith("/api/v1/submissions"),
    );
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      claim_text: "The river stops flowing every winter.",
      context_text: "A community group",
      source_url: "https://example.org/post",
      contact: { email: "reader@example.org" },
      privacy_consent: true,
      website: "",
    });
    await expectAccessible();

    await user.click(screen.getByRole("button", { name: "Submit another claim" }));
    expect(await screen.findByLabelText("The claim")).toHaveValue("");
  });

  it("sends only the claim when everything else is blank", async () => {
    const fetchMock = installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/submit");
    await fillClaim(user, "བོད་ཀྱི་སྐོར་གྱི་གླེང་གཞི་འདི་བདེན་དཔྱད་དགོས།");
    await user.click(screen.getByRole("button", { name: "Send claim" }));
    await screen.findByRole("heading", { name: "Thank you" });
    const call = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input as RequestInfo | URL).endsWith("/api/v1/submissions"),
    );
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual({
      claim_text: "བོད་ཀྱི་སྐོར་གྱི་གླེང་གཞི་འདི་བདེན་དཔྱད་དགོས།",
      privacy_consent: false,
      website: "",
    });
  });

  it("reports a service failure and keeps what the visitor typed", async () => {
    installPublicApi();
    const user = userEvent.setup();
    const claim = "The river stops flowing every winter.";
    renderApp("/en/submit");
    await fillClaim(user, claim);

    installFetch((url) => {
      if (url.endsWith("/api/v1/me")) {
        return { status: 401, body: { detail: "Authentication required" } };
      }
      return { status: 500, body: { detail: "boom" } };
    });
    await user.click(screen.getByRole("button", { name: "Send claim" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("The claim")).toHaveValue(claim);
  });

  it("does not render the verification widget unless it is configured, and requires it when it is", async () => {
    installPublicApi();
    const first = renderApp("/en/submit");
    await screen.findByRole("heading", { name: "Submit a claim" });
    expect(screen.queryByText("Verification")).not.toBeInTheDocument();
    first.unmount();

    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0x4AAAAAAAexample");
    const fetchMock = installPublicApi();
    const user = userEvent.setup();
    renderApp("/en/submit");
    expect(await screen.findByText("Verification")).toBeInTheDocument();
    await fillClaim(user, "The river stops flowing every winter.");
    await user.click(screen.getByRole("button", { name: "Send claim" }));
    expect(await screen.findAllByText("Complete the verification before sending.")).toHaveLength(2);
    expect(fetchedUrls(fetchMock).some((url) => url.pathname === "/api/v1/submissions")).toBe(
      false,
    );
  });
});
