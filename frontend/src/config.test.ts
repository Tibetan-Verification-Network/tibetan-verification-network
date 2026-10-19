import { describe, expect, it } from "vitest";

import { ConfigurationError, readApiBaseUrl } from "./config";

describe("readApiBaseUrl", () => {
  it("keeps only the origin", () => {
    expect(readApiBaseUrl("http://localhost:8000/ready?token=secret#fragment")).toBe(
      "http://localhost:8000",
    );
  });

  it("rejects credentials without repeating them", () => {
    const value = "http://auditor:super-secret-password@localhost:8000";
    expect(() => readApiBaseUrl(value)).toThrow(ConfigurationError);
    try {
      readApiBaseUrl(value);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).not.toContain("super-secret-password");
      expect((error as Error).message).not.toContain("auditor");
    }
  });

  it("rejects a missing or non-http value", () => {
    expect(() => readApiBaseUrl("")).toThrow(/not configured/);
    expect(() => readApiBaseUrl("file:///tmp/api")).toThrow(ConfigurationError);
    expect(() => readApiBaseUrl("not a url")).toThrow(ConfigurationError);
  });
});
