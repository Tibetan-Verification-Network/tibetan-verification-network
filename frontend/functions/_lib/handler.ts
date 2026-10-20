import type { FetchApi } from "./env";
import {
  articleMeta,
  missingMeta,
  staticMeta,
  topicMeta,
  type ArticleDetail,
  type PageMeta,
  type TopicDetail,
} from "./meta";
import { registerMetaHandlers, type RewriterLike } from "./rewrite";
import { parsePublicPath, type PublicRoute } from "./routes";

export interface TransformingRewriter extends RewriterLike {
  transform(response: Response): Response;
}

export interface PageDeps {
  fetchApi: FetchApi | null;
  createRewriter: () => TransformingRewriter;
}

type Resolved = { meta: PageMeta; missing: boolean } | null;

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Work out the meta for a public route. Returns null when the API cannot answer. */
export async function resolveMeta(
  route: PublicRoute,
  origin: string,
  fetchApi: FetchApi | null,
): Promise<Resolved> {
  if (route.kind === "static") {
    return { meta: staticMeta(origin, route), missing: false };
  }
  if (fetchApi === null) {
    return null;
  }
  try {
    if (route.kind === "topic") {
      const response = await fetchApi(`/api/v1/topics/${encodeURIComponent(route.slug)}`);
      if (response.status === 404) {
        return { meta: missingMeta(origin, route), missing: true };
      }
      const topic = response.ok ? await readJson<TopicDetail>(response) : null;
      return topic === null ? null : { meta: topicMeta(origin, route, topic), missing: false };
    }
    const response = await fetchApi(
      `/api/v1/factchecks/${encodeURIComponent(route.slug)}?lang=${route.locale}`,
    );
    if (response.status === 404) {
      return { meta: missingMeta(origin, route), missing: true };
    }
    const detail = response.ok ? await readJson<ArticleDetail>(response) : null;
    return detail === null ? null : { meta: articleMeta(origin, route, detail), missing: false };
  } catch {
    return null;
  }
}

/**
 * Wrap the SPA's HTML response with per-language title, description, canonical, hreflang, and
 * Open Graph tags. Anything that is not a public HTML page passes through untouched.
 */
export async function withPageMeta(
  request: Request,
  origin: string,
  response: Response,
  deps: PageDeps,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response;
  }
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    return response;
  }
  const route = parsePublicPath(new URL(request.url).pathname);
  if (route === null) {
    return response;
  }
  const resolved = await resolveMeta(route, origin, deps.fetchApi);
  if (resolved === null) {
    return response;
  }
  const base = resolved.missing
    ? new Response(response.body, { status: 404, headers: response.headers })
    : response;
  const rewriter = deps.createRewriter();
  registerMetaHandlers(rewriter, resolved.meta);
  return rewriter.transform(base);
}
