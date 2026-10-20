import { siteOrigin, type Env } from "./_lib/env";
import { buildRobots } from "./_lib/robots";

export const onRequestGet: PagesFunction<Env> = (context) =>
  new Response(buildRobots(siteOrigin(context.env, new URL(context.request.url))), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
