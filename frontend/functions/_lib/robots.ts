export function buildRobots(origin: string): string {
  return [
    "User-agent: *",
    "Disallow: /editorial",
    "Disallow: /login",
    "Disallow: /activate",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}
