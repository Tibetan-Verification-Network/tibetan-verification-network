import { fetchApiFor, siteOrigin, type Env } from "./_lib/env";
import { collectArticles, collectTopics, buildSitemap } from "./_lib/sitemap";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const fetchApi = fetchApiFor(context.env);
  if (fetchApi === null) {
    return new Response("Sitemap is not configured.", { status: 503 });
  }
  try {
    const [en, bo, topics] = await Promise.all([
      collectArticles(fetchApi, "en"),
      collectArticles(fetchApi, "bo"),
      collectTopics(fetchApi),
    ]);
    const origin = siteOrigin(context.env, new URL(context.request.url));
    return new Response(buildSitemap(origin, [...en, ...bo], topics), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Sitemap is temporarily unavailable.", { status: 503 });
  }
};
