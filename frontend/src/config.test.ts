import { describe, expect, it } from "vitest";

import { ConfigurationError, readApiBaseUrl, readPasswordMinLength } from "./config";

describe("readPasswordMinLength", () => {
  it("defaults to 12 and clamps to backend bounds", () => {
    expect(readPasswordMinLength("")).toBe(12);
    expect(readPasswordMinLength("10")).toBe(10);
    expect(readPasswordMinLength("7")).toBe(8);
    expect(readPasswordMinLength("999")).toBe(128);
    expect(readPasswordMinLength("not-a-number")).toBe(12);
  });
});

describe("readApiBaseUrl", () => {
  it("keeps only the origin", () => {
    expect(readApiBaseUrl("http://localhost:8000/ready?token=secret#fragment")).toBe(
      "http://localhost:8000",
    );
  });

  it("treats / as the page's own origin", () => {
    expect(readApiBaseUrl("/", "https://tvn.example.org")).toBe("https://tvn.example.org");
    expect(readApiBaseUrl(" / ", "http://localhost:3000")).toBe("http://localhost:3000");
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
