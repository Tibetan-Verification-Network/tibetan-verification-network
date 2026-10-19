import { describe, expect, it, vi } from "vitest";

import { loadReadiness } from "./readiness";

describe("loadReadiness", () => {
  it("treats a malformed success body as not ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      }),
    );

    await expect(loadReadiness("http://localhost:8000")).resolves.toBe("not_ready");
  });
});
