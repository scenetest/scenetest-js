#!/usr/bin/env node

/**
 * Copies documentation from the monorepo docs/ directory into this package's
 * docs/ directory. Run during build to ensure published package includes docs.
 */

import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");
const monorepoDocsRoot = join(packageRoot, "..", "..", "docs", "public");
const targetDocsRoot = join(packageRoot, "docs");

const docsToCopy = {
  guides: [
    "getting-started.md",
    "writing-scene-specs.md",
    "writing-inline-assertions.md",
    "building-teams.md",
    "understanding-concurrent-driver.md",
    "llm-team-generation.md",
  ],
  reference: [
    "actor-api.md",
    "selectors.md",
    "text-dsl.md",
    "concurrent-and-classic.md",
    "cli.md",
  ],
  design: [
    "writing-tests.md",
    "scene-vs-flow.md",
    "actors-api.md",
  ],
  faq: [
    "concurrent-vs-classic.md",
    "security.md",
    "swarm-mode.md",
    "vs-cypress.md",
    "vs-playwright.md",
    "vs-vitest.md",
    "vscode-extension.md",
  ],
};

let copied = 0;
let skipped = 0;

for (const [category, files] of Object.entries(docsToCopy)) {
  const targetDir = join(targetDocsRoot, category);
  mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    const src = join(monorepoDocsRoot, category, file);
    const dest = join(targetDir, file);

    if (existsSync(src)) {
      cpSync(src, dest);
      copied++;
    } else {
      console.warn(`  warning: ${category}/${file} not found at ${src}`);
      skipped++;
    }
  }
}

console.log(`bundle-docs: ${copied} docs copied, ${skipped} skipped`);
