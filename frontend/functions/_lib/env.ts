export interface Env {
  /** Origin of the public API, for example `https://api.example.org`. */
  API_BASE_URL?: string;
  /** Public origin of this site. Defaults to the request origin. */
  SITE_ORIGIN?: string;
}

export function apiOrigin(env: Env): string | null {
  const value = env.API_BASE_URL?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function siteOrigin(env: Env, requestUrl: URL): string {
  const value = env.SITE_ORIGIN?.trim();
  if (value) {
    try {
      return new URL(value).origin;
    } catch {
      // Fall through to the request origin.
    }
  }
  return requestUrl.origin;
}

export type FetchApi = (path: string) => Promise<Response>;

export function fetchApiFor(env: Env): FetchApi | null {
  const origin = apiOrigin(env);
  if (origin === null) {
    return null;
  }
  return (path) =>
    fetch(new URL(path, `${origin}/`), {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
}
