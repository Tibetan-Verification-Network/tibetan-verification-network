import { fetchApiFor, siteOrigin, type Env } from "./_lib/env";
import { withPageMeta } from "./_lib/handler";

/**
 * Adds per-language title, description, canonical, hreflang, and Open Graph tags to the SPA
 * shell for public pages. Staff pages, assets, and API-less deployments pass through.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();
  const url = new URL(context.request.url);
  return withPageMeta(context.request, siteOrigin(context.env, url), response, {
    fetchApi: fetchApiFor(context.env),
    createRewriter: () => new HTMLRewriter(),
  });
};
