import axe from "axe-core";
import { expect } from "vitest";

export async function expectAccessible() {
  const results = await axe.run(document, {
    resultTypes: ["violations"],
  });
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map((node) => node.html),
  }));
  expect(violations).toEqual([]);
}
