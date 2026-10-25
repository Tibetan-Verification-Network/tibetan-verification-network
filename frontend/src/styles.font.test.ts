import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("font stack", () => {
  it("uses a self-hosted Tibetan face and system fallbacks", () => {
    const css = readFileSync(join(here, "styles.css"), "utf8");
    const entry = readFileSync(join(here, "main.tsx"), "utf8");
    expect(entry).toContain("@fontsource/noto-serif-tibetan/400.css");
    expect(entry).toContain("@fontsource/noto-sans/latin-400.css");
    expect(css).toContain("Noto Serif Tibetan");
    expect(css).toContain("Noto Sans");
    expect(css).toContain('font-family: "Monlam Uni OuChan5"');
    expect(css).toContain("MonlamUniOuChan5-Regular.woff2");
    expect(css).toContain("Microsoft Himalaya");
    expect(css).toContain("Kailasa");
    expect(css).toContain("@media (max-width: 40rem)");
    expect(css).not.toContain("fonts.googleapis.com");
    expect(entry).not.toContain("fonts.googleapis.com");
  });
});
