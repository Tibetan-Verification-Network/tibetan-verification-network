import { describe, expect, it } from "vitest";

import { withPageMeta, type TransformingRewriter } from "./handler";
import type { ElementHandler } from "./rewrite";

interface Recorded {
  selector: string;
  calls: { method: string; args: unknown[] }[];
}

/** A recording stand-in for HTMLRewriter that replays each handler on a fake element. */
function fakeRewriter(): {
  rewriter: TransformingRewriter;
  recorded: Recorded[];
  status: () => number;
} {
  const handlers: [string, ElementHandler][] = [];
  const recorded: Recorded[] = [];
  let status = 0;
  const rewriter: TransformingRewriter = {
    on(selector, handler) {
      handlers.push([selector, handler]);
      return rewriter;
    },
    transform(response) {
      status = response.status;
      for (const [selector, handler] of handlers) {
        const entry: Recorded = { selector, calls: [] };
        handler.element({
          setAttribute: (...args) => entry.calls.push({ method: "setAttribute", args }),
          setInnerContent: (...args) => entry.calls.push({ method: "setInnerContent", args }),
          append: (...args) => entry.calls.push({ method: "append", args }),
        });
        recorded.push(entry);
      }
      return response;
    },
  };
  return { rewriter, recorded, status: () => status };
}

function html(status = 200): Response {
  return new Response("<html><head><title>x</title></head></html>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function apiReturning(routes: Record<string, { status: number; body?: unknown }>) {
  const requested: string[] = [];
  return {
    requested,
    fetchApi: async (path: string) => {
      requested.push(path);
      const hit = routes[path];
      if (hit === undefined) {
        throw new Error(`unexpected API call ${path}`);
      }
      return Response.json(hit.body ?? {}, { status: hit.status });
    },
  };
}

const DETAIL = {
  snapshot: {
    title: "Does the river run dry?",
    summary: "A viral post claims the river dries up.",
    claim_text: "The river stops flowing.",
    kind: "initial",
    withdrawal_notice: null,
  },
  translations: [
    { language: "en", status: "published" },
    { language: "bo", status: "pending" },
  ],
};

describe("withPageMeta", () => {
  it("rewrites lang, title, description, and head for an article using the API", async () => {
    const api = apiReturning({
      "/api/v1/factchecks/river-claim?lang=en": { status: 200, body: DETAIL },
    });
    const { rewriter, recorded } = fakeRewriter();
    await withPageMeta(
      new Request("https://example.org/en/fact-checks/river-claim"),
      "https://example.org",
      html(),
      { fetchApi: api.fetchApi, createRewriter: () => rewriter },
    );

    expect(api.requested).toEqual(["/api/v1/factchecks/river-claim?lang=en"]);
    const bySelector = Object.fromEntries(recorded.map((entry) => [entry.selector, entry.calls]));
    expect(bySelector["html"]).toEqual([{ method: "setAttribute", args: ["lang", "en"] }]);
    expect(bySelector["title"]).toEqual([
      {
        method: "setInnerContent",
        args: ["Does the river run dry? — Tibetan Verification Network"],
      },
    ]);
    expect(bySelector['meta[name="description"]']).toEqual([
      { method: "setAttribute", args: ["content", "A viral post claims the river dries up."] },
    ]);
    const head = bySelector["head"]?.[0];
    expect(head?.method).toBe("append");
    expect(head?.args[1]).toEqual({ html: true });
    expect(String(head?.args[0])).toContain(
      '<link rel="canonical" href="https://example.org/en/fact-checks/river-claim">',
    );
  });

  it("answers 404 with noindex for an unpublished slug", async () => {
    const api = apiReturning({ "/api/v1/factchecks/guess?lang=bo": { status: 404 } });
    const { rewriter, recorded, status } = fakeRewriter();
    await withPageMeta(
      new Request("https://example.org/bo/fact-checks/guess"),
      "https://example.org",
      html(),
      { fetchApi: api.fetchApi, createRewriter: () => rewriter },
    );
    expect(status()).toBe(404);
    const head = recorded.find((entry) => entry.selector === "head")?.calls[0];
    expect(String(head?.args[0])).toContain('<meta name="robots" content="noindex">');
  });

  it("does not call the API for static pages", async () => {
    const api = apiReturning({});
    const { rewriter, recorded } = fakeRewriter();
    await withPageMeta(new Request("https://example.org/bo/about"), "https://example.org", html(), {
      fetchApi: api.fetchApi,
      createRewriter: () => rewriter,
    });
    expect(api.requested).toEqual([]);
    expect(recorded.find((entry) => entry.selector === "html")?.calls[0]?.args).toEqual([
      "lang",
      "bo",
    ]);
  });

  it("passes through staff pages, assets, non-HTML, and non-GET requests", async () => {
    const api = apiReturning({});
    const made: string[] = [];
    const deps = {
      fetchApi: api.fetchApi,
      createRewriter: () => {
        made.push("rewriter");
        return fakeRewriter().rewriter;
      },
    };
    const staff = html();
    expect(
      await withPageMeta(
        new Request("https://example.org/editorial"),
        "https://example.org",
        staff,
        deps,
      ),
    ).toBe(staff);
    const css = new Response("body{}", { headers: { "content-type": "text/css" } });
    expect(
      await withPageMeta(
        new Request("https://example.org/en/about"),
        "https://example.org",
        css,
        deps,
      ),
    ).toBe(css);
    const post = html();
    expect(
      await withPageMeta(
        new Request("https://example.org/en/about", { method: "POST" }),
        "https://example.org",
        post,
        deps,
      ),
    ).toBe(post);
    expect(made).toEqual([]);
  });

  it("leaves the page alone when the API fails or is not configured", async () => {
    const failing = {
      fetchApi: async () => {
        throw new Error("network");
      },
      createRewriter: () => fakeRewriter().rewriter,
    };
    const first = html();
    expect(
      await withPageMeta(
        new Request("https://example.org/en/fact-checks/river-claim"),
        "https://example.org",
        first,
        failing,
      ),
    ).toBe(first);

    const second = html();
    expect(
      await withPageMeta(
        new Request("https://example.org/en/fact-checks/river-claim"),
        "https://example.org",
        second,
        { fetchApi: null, createRewriter: () => fakeRewriter().rewriter },
      ),
    ).toBe(second);

    const third = html();
    const serverError = apiReturning({
      "/api/v1/factchecks/river-claim?lang=en": { status: 500 },
    });
    expect(
      await withPageMeta(
        new Request("https://example.org/en/fact-checks/river-claim"),
        "https://example.org",
        third,
        { fetchApi: serverError.fetchApi, createRewriter: () => fakeRewriter().rewriter },
      ),
    ).toBe(third);
  });
});
