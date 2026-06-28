# Contributing to MonadForge

Thank you for contributing to MonadForge! This document provides guidelines for setting up your environment, adding new features (such as skills or MCP tools), and validating your changes.

---

## Project Structure

MonadForge is structured as a TypeScript monorepo using npm/yarn workspaces.

```
├── sdk/                # Shared logging, configuration, vector fallback databases
├── intent/             # NLP Intent Parsing Engine
├── plan/               # Planner and Workflow Steps Generator
├── skills/             # Skill Routing and node tool implementations
├── templates/          # Solidity Smart Contract templates (ERC20, ERC721, etc.)
├── actions/            # Low-level blockchain, compilation, and deployment tasks
├── repair/             # Self-healing diagnostics and code repair engine
├── memory/             # Local project state and deployment records
├── composition/        # Workflow step composer
├── node-runtime/      # Core execution loop and self-healing orchestration
├── review/             # Architecture, design, security, and scalability reviewer
├── mcp/                # Model Context Protocol server stdio entrypoint
├── cli/                # Terminal CLI tool wrapper
└── monadforge/            # Unified publishable SDK package (@monadforge/automated)
```

---

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build all workspaces:
   ```bash
   npm run build
   ```
3. Run test suites:
   ```bash
   npm test
   ```

---

## How to Add a New Skill

1. Identify the package where the skill should live or edit the `skills/src/index.ts` file.
2. Register the skill name in the `route` method inside [AgentSkills](file:///Users/mac/MONADFORGE%20AI/skills/src/index.ts).
3. Supply input parameters and handle calls to downstream action components.
4. Add unit tests under `skills/tests/` to verify your skill logic and cover all conditional branches.

---

## How to Add a New MCP Tool

1. Open [mcp/src/index.ts](file:///Users/mac/MONADFORGE%20AI/mcp/src/index.ts).
2. Register your tool name and JSON input schema inside the `ListToolsRequestSchema` handler list.
3. Add a switch-case statement inside `CallToolRequestSchema` handler to map your tool name to a local handler function or engine.
4. Update unit tests in [mcp/tests/mcp-server.test.ts](file:///Users/mac/MONADFORGE%20AI/mcp/tests/mcp-server.test.ts) to verify tool listing and mock executions.

---

## Testing & Coverage Requirements

- We maintain a strict global statement and branch coverage threshold of **>95%**.
- Before opening a Pull Request, run:
  ```bash
  npm test
  ```
  Ensure all tests pass and coverage is clean.
