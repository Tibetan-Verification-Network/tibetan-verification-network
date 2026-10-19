import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = [
  "Tibetan FactCheck",
  "DATABASE_URL",
  "postgresql://",
  "postgres://",
  "tvn_local_dev",
  "password=",
  "super-secret",
];

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

const allFiles = walk("dist");
const files = allFiles.filter((file) => /\.(html|js|css)$/.test(file));
if (files.length === 0) {
  console.error("Production build did not create any HTML, CSS, or JS files.");
  process.exit(1);
}

const contents = files.map((file) => readFileSync(file, "utf8")).join("\n");
if (!contents.includes("Tibetan Verification Network")) {
  console.error("Production build is missing the product name.");
  process.exit(1);
}
if (!contents.includes('lang="en"')) {
  console.error("Production build is missing the document language.");
  process.exit(1);
}
if (!contents.includes("Noto Serif Tibetan")) {
  console.error("Production build is missing the self-hosted Tibetan font.");
  process.exit(1);
}
if (!allFiles.some((file) => file.endsWith(".woff2"))) {
  console.error("Production build did not emit a self-hosted font file.");
  process.exit(1);
}
for (const remote of ["fonts.googleapis.com", "fonts.gstatic.com"]) {
  if (contents.includes(remote)) {
    console.error(`Production build loads a remote font from ${remote}`);
    process.exit(1);
  }
}

for (const term of forbidden) {
  if (term === "password=") {
    continue;
  }
  if (contents.includes(term)) {
    console.error(`Production build contains forbidden term: ${term}`);
    process.exit(1);
  }
}
if (/password=(?!=)/.test(contents)) {
  console.error("Production build contains a password assignment.");
  process.exit(1);
}

console.log(`Verified ${files.length} production files.`);
