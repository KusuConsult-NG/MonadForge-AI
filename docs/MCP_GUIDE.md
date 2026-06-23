# MonadForge AI Model Context Protocol (MCP) Guide

This guide details how to install, configure, integrate, and troubleshoot the MonadForge AI Model Context Protocol (MCP) server.

The MCP server exposes MonadForge AI's capabilities directly to AI IDEs and clients such as Cursor, Claude Desktop, and Windsurf.

---

## Architecture Overview

The MCP Server runs locally via `stdio` transport. It enables AI agents to plan, compose skills, and interact with the Monad blockchain deterministically.

```
┌────────────────┐          ┌───────────────────┐          ┌──────────────┐
│  AI Assistant  │ ◄──────► │ MonadForge AI MCP │ ◄──────► │  Monad EVM   │
│ (Cursor/Claude)│  stdio   │      Server       │   JSON   │ Testnet/Local│
└────────────────┘          └───────────────────┘          └──────────────┘
```

---

## Installation & Build

Ensure you have built the monorepo from the root directory:

```bash
# Clone the repository and install dependencies
git clone https://github.com/monad-ecosystem/monadforge.git
cd monadforge
npm install

# Compile the TypeScript workspaces
npm run build
```

The MCP entrypoint will be compiled to `mcp/dist/index.js`.

---

## Configuration

To run the MCP server, you need to configure the required environment variables. You can specify these in a local `.env` file or pass them in the configuration settings of your AI client.

### Required Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `MONAD_RPC_URL` | Monad RPC Endpoint | `https://rpc-devnet.monad.xyz` |
| `DEPLOYER_PRIVATE_KEY` | Hex private key for deployment | `0x...` |
| `QDRANT_URL` | Qdrant vector database URL (Optional) | Local mock used if empty |

---

## Client Integrations

Below are copy-paste configuration files for popular AI environments.

### 1. Cursor Integration

To add the MonadForge AI MCP server to **Cursor**:

1. Go to **Cursor Settings** (Preferences) -> **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Fill in the modal:
   - **Name**: `MonadForge AI`
   - **Type**: `command`
   - **Command**:
     ```bash
     node /absolute/path/to/monadforge/mcp/dist/index.js
     ```
4. Click **Save**.

### 2. Claude Desktop Integration

To add the server to **Claude Desktop**, open or create your `claude_desktop_config.json` file.

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following entry under `"mcpServers"`:

```json
{
  "mcpServers": {
    "monadforge": {
      "command": "node",
      "args": [
        "/absolute/path/to/monadforge/mcp/dist/index.js"
      ],
      "env": {
        "MONAD_RPC_URL": "https://rpc-devnet.monad.xyz",
        "DEPLOYER_PRIVATE_KEY": "0x0000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  }
}
```

### 3. Windsurf Integration

To add the server to **Windsurf**, edit your `~/.codeium/windsurf/mcp_config.json` file:

```json
{
  "mcpServers": {
    "monadforge": {
      "command": "node",
      "args": [
        "/absolute/path/to/monadforge/mcp/dist/index.js"
      ],
      "env": {
        "MONAD_RPC_URL": "https://rpc-devnet.monad.xyz",
        "DEPLOYER_PRIVATE_KEY": "0x0000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  }
}
```

---

## Exposed MCP Tools

The server registers exactly 9 public developer-facing tools for agent consumption:

1. **`create_project`**: Initialize a new MonadForge AI project structure.
2. **`generate_contract`**: Generate smart contracts using AI matching specified parameters (e.g. token, nft, staking, dao).
3. **`compose_application`**: Compose a multi-skill software system workflow.
4. **`audit_project`**: Scan smart contracts in the project directory for vulnerabilities.
5. **`repair_project`**: Invoke the self-healing repair loop on failing components or contracts.
6. **`deploy_project`**: Compile, scan, and deploy project contracts to Monad Testnet.
7. **`continue_project`**: Resume development on an existing codebase with memory context.
8. **`review_architecture`**: Perform design, security, and scalability architecture reviews.
9. **`get_project_context`**: Retrieve the memory context (contracts, deployments, planning history) for a project.

---

## Troubleshooting

### MCP Server Fails to Connect
- **Error**: Cursor or Claude shows "Disconnected" or "Failed to connect".
- **Fix**: Check that the path to `index.js` is absolute and the file exists. Run `node /absolute/path/to/monadforge/mcp/dist/index.js` directly in your shell to ensure it doesn't crash on startup.

### Missing Private Key or Invalid RPC
- **Error**: Wallet actions fail with `private key is missing` or `invalid RPC URL`.
- **Fix**: Check that the environment variables are correctly injected into your MCP client's configuration file or shell environment.

### Reviewing Logs
- Cursor logs are located under `Help` -> `Toggle Developer Tools` -> `Console`.
- Claude logs are stored in:
  - macOS: `~/Library/Logs/Claude/mcp.log`
  - Windows: `%APPDATA%\Claude\Logs\mcp.log`
