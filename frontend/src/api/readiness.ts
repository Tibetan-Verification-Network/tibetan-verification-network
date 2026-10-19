export type Readiness = "ready" | "not_ready";

interface ReadyBody {
  status: "ready";
}

function isReadyBody(value: unknown): value is ReadyBody {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return false;
  }
  return value.status === "ready";
}

export async function loadReadiness(baseUrl: string, signal?: AbortSignal): Promise<Readiness> {
  try {
    const response = await fetch(new URL("/ready", `${baseUrl}/`), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      return "not_ready";
    }
    const body: unknown = await response.json();
    return isReadyBody(body) ? "ready" : "not_ready";
  } catch {
    return "not_ready";
  }
}
