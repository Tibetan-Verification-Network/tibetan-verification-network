import { describe, expect, it } from "vitest";

import { editorialReturnPath } from "./returnPath";

describe("editorialReturnPath", () => {
  it("keeps editorial paths and drops anything that could leave the site", () => {
    expect(editorialReturnPath("/editorial/inbox")).toBe("/editorial/inbox");
    expect(editorialReturnPath("https://evil.example/editorial")).toBe("/editorial");
    expect(editorialReturnPath("//evil.example")).toBe("/editorial");
    expect(editorialReturnPath("/login")).toBe("/editorial");
    expect(editorialReturnPath("/editorial?token=secret")).toBe("/editorial");
  });
});
