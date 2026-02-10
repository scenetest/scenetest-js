# @scenetest/mcp-server

MCP (Model Context Protocol) server that exposes scenetest documentation and guidance to LLMs. When your coding assistant has access to this server, it can look up how to write scene specs, use the actor API, resolve selectors, build teams, and more.

## Setup

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "scenetest": {
      "command": "npx",
      "args": ["@scenetest/mcp-server"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "scenetest": {
      "command": "npx",
      "args": ["@scenetest/mcp-server"]
    }
  }
}
```

### Cursor / Windsurf / other MCP clients

Point your MCP client at the `npx @scenetest/mcp-server` command using stdio transport.

## What's exposed

### Tools

| Tool | Description |
|------|-------------|
| `list_docs` | List all available documentation topics — guides, references, design docs, and FAQs |
| `read_doc` | Read a specific documentation page by slug |
| `search_docs` | Full-text search across all documentation |

### Prompts

| Prompt | Description |
|--------|-------------|
| `write_scene_test` | Complete guidance for writing a scene test (with style: concurrent, classic, or text-dsl) |
| `write_inline_assertions` | Guidance for adding inline assertions to components |
| `build_team` | Guidance for designing actor teams and seed data |

## Documentation included

**Guides**: getting-started, writing-scene-specs, writing-inline-assertions, building-teams, understanding-concurrent-driver, llm-team-generation

**Reference**: actor-api, selectors, text-dsl, concurrent-and-classic, cli

**Design**: writing-tests, scene-vs-flow, actors-api

**FAQ**: concurrent-vs-classic, security, swarm-mode, vs-cypress, vs-playwright, vs-vitest, vscode-extension
