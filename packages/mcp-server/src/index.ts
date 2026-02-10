#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Resolve docs directory
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveDocsDir(): string {
  // Published package: docs/ is sibling to dist/
  const packageDocs = join(__dirname, "..", "docs");
  if (existsSync(packageDocs)) return packageDocs;

  // Monorepo development: docs are in the repo root
  const monorepoDocs = join(__dirname, "..", "..", "..", "docs", "public");
  if (existsSync(monorepoDocs)) return monorepoDocs;

  throw new Error(
    `Could not find docs directory. Checked:\n  ${packageDocs}\n  ${monorepoDocs}`
  );
}

// ---------------------------------------------------------------------------
// Doc loader
// ---------------------------------------------------------------------------

interface DocEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  content: string;
}

const DOC_DESCRIPTIONS: Record<string, string> = {
  // guides
  "getting-started":
    "Adding Scenetest to an existing Vite project with inline checks and scene specs.",
  "writing-scene-specs":
    "How to write scene specs — user journeys through an application. Covers all three authoring styles, actor methods, selectors, scope navigation, and common mistakes.",
  "writing-inline-assertions":
    "Inline assertions that live inside components and verify internal state. Covers should(), failed(), useCheck, and framework bindings.",
  "building-teams":
    "Designing actor teams that mirror seed data. Team structure, role naming, seed data patterns, scaling, and common multi-actor patterns.",
  "understanding-concurrent-driver":
    "In-depth guide to how the concurrent-actor driver model works internally.",
  "llm-team-generation":
    "Prompts and strategies for using LLMs to generate team definitions and seed data from a codebase.",
  // reference
  "actor-api":
    "Complete reference for actor handle methods: navigation, visibility, interaction, timing, coordination, scope, conditionals. Code examples for both concurrent and classic modes.",
  selectors:
    "Selector resolution: attribute matching (aria-label, data-testid, data-key, etc.), nested selectors, key selectors, aliases, sigils, debugging with explainSelector().",
  "text-dsl":
    "Text DSL grammar: actions, selectors, values, quoting, .spec.md markdown format, variable interpolation, macro definition and invocation.",
  "concurrent-and-classic":
    "The two TypeScript execution models (concurrent scene() and classic test()) and three authoring formats. Critical rules for not mixing models.",
  cli:
    "CLI usage: command-line options, configuration file, team discovery, device rotation, swarm mode, reports, exit codes.",
  // design
  "writing-tests":
    "Top-level test-authoring reference for humans and LLMs. Covers all three models, actor DSL, selectors, configuration, and links to canonical references.",
  "scene-vs-flow":
    "Design rationale comparing the concurrent and classic execution models. Decision criteria for which to keep before 1.0.",
  "actors-api":
    "Actor system design: sparse-by-default philosophy, team design, role naming conventions, relationship to seed data.",
  // faq
  "concurrent-vs-classic":
    "FAQ: When to choose concurrent flow vs classic driver.",
  security: "FAQ: Security model — how server functions are sandboxed.",
  "swarm-mode":
    "FAQ: Swarm mode — diagnostic escalation that runs all teams concurrently against failing scenes.",
  "vs-cypress": "FAQ: How Scenetest differs from Cypress component testing.",
  "vs-playwright":
    "FAQ: How serverCheck() differs from Playwright's page.evaluate().",
  "vs-vitest":
    "FAQ: How Scenetest differs from Vitest's in-source testing.",
  "vscode-extension": "FAQ: VS Code extension for text DSL syntax highlighting.",
};

function loadDocs(docsDir: string): DocEntry[] {
  const docs: DocEntry[] = [];

  const categories = readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categories) {
    const categoryDir = join(docsDir, category);
    const files = readdirSync(categoryDir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const content = readFileSync(join(categoryDir, file), "utf-8");
      const slug = basename(file, ".md");

      // Extract title from first # heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : slug;

      const description = DOC_DESCRIPTIONS[slug] ?? "";

      docs.push({ slug, title, description, category, content });
    }
  }

  return docs;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const docsDir = resolveDocsDir();
const docs = loadDocs(docsDir);

const server = new McpServer({
  name: "scenetest",
  version: "0.2.0",
});

// ---------------------------------------------------------------------------
// Tool: list_docs
// ---------------------------------------------------------------------------

server.tool(
  "list_docs",
  "List all available scenetest documentation. Call this first to discover what guides, references, and FAQs are available.",
  {},
  async () => {
    const grouped: Record<
      string,
      { slug: string; title: string; description: string }[]
    > = {};
    for (const doc of docs) {
      if (!grouped[doc.category]) grouped[doc.category] = [];
      grouped[doc.category].push({
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
      });
    }

    const categoryOrder = ["guides", "reference", "design", "faq"];
    const categoryLabels: Record<string, string> = {
      guides: "Guides (how-to)",
      reference: "Reference (API & formats)",
      design: "Design (architecture & rationale)",
      faq: "FAQ",
    };

    let text = "# Scenetest Documentation\n\n";
    text +=
      "Use `read_doc` with a slug to read the full content of any document.\n";
    text +=
      "Use `search_docs` to search across all documentation for a keyword.\n\n";

    for (const cat of categoryOrder) {
      const entries = grouped[cat];
      if (!entries) continue;
      text += `## ${categoryLabels[cat] ?? cat}\n\n`;
      for (const entry of entries) {
        text += `- **${entry.slug}**`;
        if (entry.description) text += ` — ${entry.description}`;
        text += "\n";
      }
      text += "\n";
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: read_doc
// ---------------------------------------------------------------------------

const slugEnum = docs.map((d) => d.slug);

server.tool(
  "read_doc",
  "Read a specific scenetest documentation page. Returns the full markdown content. Use list_docs first to see available slugs.",
  {
    slug: z
      .string()
      .describe(
        `Document slug. Available: ${slugEnum.join(", ")}`
      ),
  },
  async ({ slug }) => {
    const doc = docs.find((d) => d.slug === slug);
    if (!doc) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Document "${slug}" not found.\n\nAvailable slugs: ${slugEnum.join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `# ${doc.title}\n\n_Category: ${doc.category}_\n\n---\n\n${doc.content}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: search_docs
// ---------------------------------------------------------------------------

server.tool(
  "search_docs",
  "Search across all scenetest documentation for matching content. Returns excerpts with context from matching documents.",
  {
    query: z.string().describe("Search query (space-separated terms, all must match)"),
  },
  async ({ query }) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return {
        content: [{ type: "text" as const, text: "Please provide a search query." }],
        isError: true,
      };
    }

    const results: {
      slug: string;
      title: string;
      category: string;
      excerpts: string[];
    }[] = [];

    for (const doc of docs) {
      const contentLower = doc.content.toLowerCase();
      if (!terms.every((term) => contentLower.includes(term))) continue;

      const lines = doc.content.split("\n");
      const excerpts: string[] = [];
      const seen = new Set<number>();

      for (let i = 0; i < lines.length; i++) {
        if (terms.some((term) => lines[i].toLowerCase().includes(term))) {
          if (seen.has(i)) continue;
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          for (let j = start; j < end; j++) seen.add(j);
          excerpts.push(lines.slice(start, end).join("\n"));
          if (excerpts.length >= 3) break;
        }
      }

      results.push({
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        excerpts,
      });
    }

    if (results.length === 0) {
      return {
        content: [
          { type: "text" as const, text: `No results found for "${query}".` },
        ],
      };
    }

    let text = `# Search results for "${query}" (${results.length} docs)\n\n`;
    for (const result of results) {
      text += `## ${result.title} (\`${result.slug}\`)\n\n`;
      for (const excerpt of result.excerpts) {
        text += "```\n" + excerpt + "\n```\n\n";
      }
    }
    text += `Use \`read_doc\` to read any of these documents in full.\n`;

    return { content: [{ type: "text" as const, text }] };
  }
);

// ---------------------------------------------------------------------------
// Prompt: write_scene_test
// ---------------------------------------------------------------------------

server.prompt(
  "write_scene_test",
  "Complete guidance for writing a scenetest scene test — includes the authoring guide, actor API reference, and selectors reference.",
  {
    style: z
      .enum(["concurrent", "classic", "text-dsl"])
      .default("concurrent")
      .describe(
        "Authoring style: concurrent (reactive scene()), classic (async test()), or text-dsl (.spec.md markdown)"
      ),
  },
  ({ style = "concurrent" }) => {
    const find = (slug: string) => docs.find((d) => d.slug === slug);

    const parts: string[] = [];
    parts.push(
      `# Writing a Scenetest Scene Test\n\nAuthoring style: **${style}**\n`
    );

    const writingGuide = find("writing-scene-specs");
    if (writingGuide) parts.push(writingGuide.content);

    const actorApi = find("actor-api");
    if (actorApi) parts.push(actorApi.content);

    const selectors = find("selectors");
    if (selectors) parts.push(selectors.content);

    if (style === "text-dsl") {
      const textDsl = find("text-dsl");
      if (textDsl) parts.push(textDsl.content);
    }

    if (style === "concurrent" || style === "classic") {
      const concurrentClassic = find("concurrent-and-classic");
      if (concurrentClassic) parts.push(concurrentClassic.content);
    }

    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: parts.join("\n\n---\n\n") },
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Prompt: write_inline_assertions
// ---------------------------------------------------------------------------

server.prompt(
  "write_inline_assertions",
  "Guidance for adding inline assertions (should(), failed(), useCheck) to components.",
  {},
  () => {
    const find = (slug: string) => docs.find((d) => d.slug === slug);

    const parts: string[] = [];
    parts.push("# Writing Inline Assertions with Scenetest\n");

    const guide = find("writing-inline-assertions");
    if (guide) parts.push(guide.content);

    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: parts.join("\n\n---\n\n") },
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Prompt: build_team
// ---------------------------------------------------------------------------

server.prompt(
  "build_team",
  "Guidance for designing actor teams and seed data for concurrent scene testing.",
  {},
  () => {
    const find = (slug: string) => docs.find((d) => d.slug === slug);

    const parts: string[] = [];
    parts.push("# Building Actor Teams for Scenetest\n");

    const buildingTeams = find("building-teams");
    if (buildingTeams) parts.push(buildingTeams.content);

    const actorsDesign = find("actors-api");
    if (actorsDesign) parts.push(actorsDesign.content);

    const llmGen = find("llm-team-generation");
    if (llmGen) parts.push(llmGen.content);

    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: parts.join("\n\n---\n\n") },
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
