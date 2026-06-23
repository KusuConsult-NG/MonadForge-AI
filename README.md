# MonadForge AI

> **AI-native execution runtime for the Monad blockchain ecosystem.**  
> Build, audit, repair, and deploy EVM smart contracts with a single `npx` command or from any AI agent via MCP.

[![CI](https://github.com/monadforge/monadforge/actions/workflows/ci.yml/badge.svg)](https://github.com/monadforge/monadforge/actions)
[![npm](https://img.shields.io/npm/v/@monadforge/ai)](https://www.npmjs.com/package/@monadforge/ai)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## Why MonadForge AI?

> **Important Note:** MonadForge AI is not a code generator. It is a deterministic execution layer that enables AI agents to plan, audit, repair, deploy, verify, and continue Monad applications through a standardized execution protocol.

Standard developer toolkits (Hardhat, Foundry) are designed for human input.  
AI agents struggle with their asynchronous, multi-command outputs and lack of structured, machine-readable results.

**MonadForge AI is agent-first:**

| Capability | What it means |
|---|---|
| **Deterministic I/O** | Every action returns a typed `PrimitiveOutput<T>` envelope |
| **Self-Healing Runtime** | Automatically diagnoses, repairs, and retries failing contract compilations |
| **Economic Security** | 15 AST-based audit rules covering reentrancy, access control, oracle manipulation, flash loans, MEV |
| **Parallel EVM Optimization** | Detects and auto-refactors storage slot contention patterns for Monad's 10,000 TPS engine |
| **Agentic Value Flows** | Native ERC-20 / MON on-chain value flow creation, execution, and verification |
| **MCP Server** | Plugs into Cursor, Claude Desktop, and Windsurf out of the box |

---

## Architecture

```
                  ┌────────────────────────────────────┐
                  │       @monadforge/ai (Wrapper)     │
                  └──────────────┬─────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼──────┐   ┌───────▼──────┐   ┌──────▼────────┐
     │  Terminal CLI  │   │  MCP Server  │   │   SDK Direct  │
     └────────┬──────┘   └───────┬──────┘   └──────┬────────┘
              └──────────────────┼──────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Agent Runtime Engine   │
                    └────────────┬────────────┘
                                 │
         ┌───────────┬───────────┼───────────┬───────────┐
         │           │           │           │           │
  ┌──────▼──┐ ┌──────▼──┐ ┌─────▼────┐ ┌───▼──────┐ ┌──▼──────────┐
  │ Intent  │ │ Planner │ │ Repair   │ │ Audit    │ │ Action Layer│
  │ Engine  │ │ /Compos.│ │ Engine   │ │ Engine   │ │ (Deploy/Flow│
  └─────────┘ └─────────┘ └──────────┘ └──────────┘ └─────────────┘
```

---

## Quick Start

### Install globally
```bash
npm install -g @monadforge/ai
```

### Or run with npx (no install required)
```bash
npx @monadforge/ai init --name my-defi-project
```

### Configure environment
```bash
cp .env.example .env
# Edit .env with your deployer key and RPC URLs
```

---

## Environment Configuration

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode (`development`, `production`, `test`) |
| `LOG_LEVEL` | `INFO` | Log verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` | Primary Monad testnet RPC endpoint |
| `MONAD_RPC_URL_FALLBACK` | `https://rpc-devnet.monad.xyz` | Fallback RPC (auto-used if primary unreachable) |
| `DEPLOYER_PRIVATE_KEY` | zero key (mock mode) | Deployer wallet private key (`0x...`) — set to enable real on-chain actions |
| `QDRANT_MOCK` | `true` | If `true`, uses in-memory vector store instead of Qdrant |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database URL |
| `API_PORT` | `3000` | REST API server port |
| `MCP_PORT` | `4000` | MCP server port |

> **Mock Mode**: If `DEPLOYER_PRIVATE_KEY` is the zero key or `NODE_ENV=test`, all blockchain operations return deterministic mock responses. This allows CI/CD and local development without a funded wallet.

---

## CLI Reference

### `init` — Initialize a new project
```bash
monadforge init [options]

Options:
  -n, --name <name>          Project name (default: "monad-project")
  -i, --interactive          Interactive configuration wizard

Example:
  monadforge init --name ForgeToken
  monadforge init -i
```

### `build` — Compile Solidity contracts
```bash
monadforge build

# Compiles all .sol files in the contractsDir defined in monadforge.json
# Uses the real solc compiler (not a mock)
```

### `audit` — Security scan a contract
```bash
monadforge audit <filePath>

Arguments:
  filePath    Path to .sol file (relative to cwd)

Example:
  monadforge audit contracts/ForgeToken.sol
```

**Audit rules covered:**

| Rule ID | Severity | Category |
|---|---|---|
| `OVERFLOW-001` | High | Outdated compiler (pre-0.8.0 integer overflow) |
| `PRAGMA-001` | Medium | Missing pragma directive |
| `ACCESS-001` | Critical | Unprotected sensitive function (mint/withdraw/burn) |
| `REENTRANCY-001` | High | External call without ReentrancyGuard |
| `REENTRANCY-002` | Critical | State update after external call |
| `CALL-001` | High | Unchecked low-level call return value |
| `TX-ORIGIN-001` | Critical | Authorization via tx.origin |
| `ERC20-TRANSFER-001` | High | Unchecked ERC20 transfer return value |
| `TIMESTAMP-001` | High | Weak randomness from block.timestamp |
| `TIMESTAMP-002` | Low | Timestamp dependency for timing logic |
| `SHADOW-001` | Medium | Function argument shadows state variable |
| `SHADOW-002` | Medium | Local variable shadows state variable |
| `GAS-001` | Info | Public functions that could be external |
| `MONAD-001` | Medium | **Parallel EVM storage slot contention** |
| `ECON-001` | High | Oracle price manipulation (spot getReserves) |
| `ECON-002` | Critical | Unprotected flash loan callback |
| `ECON-003` | High | Swap without slippage/deadline guard (sandwich attack) |
| `ECON-004` | High | ERC-4626 share inflation via raw balanceOf |
| `ECON-005` | Medium | Unchecked token decimals in arithmetic |

### `deploy` — Compile, audit, and deploy
```bash
monadforge deploy [projectId] [options]

Options:
  -n, --network <network>    Target network (default: "monad-testnet")
  -y, --yes                  Skip confirmation prompt
  -i, --interactive          Interactive network + key wizard

Example:
  monadforge deploy --yes
  monadforge deploy my-project --network monad-testnet -y
```

> The deploy command runs a full security audit first. Deployment is **blocked** if any Critical or High severity issues are found.

### `continue` — Resume a previous execution
```bash
monadforge continue [projectId] [options]

Options:
  -p, --prompt <prompt>      Goal or action to continue with
```

---

## SDK API Reference

### Installation
```bash
npm install @monadforge/ai
```

### Basic Import
```typescript
import { monadforge } from '@monadforge/ai';
```

---

### `monadforge.intent`

#### `parseIntent(prompt: string): Promise<StructuredIntent>`
Parses a natural language prompt into a typed intent object.
```typescript
const intent = await monadforge.intent.parseIntent("Deploy ERC20 ForgeToken to monad-testnet");
// Returns: { type: "deploy", domain: "defi", target: "ERC20", ... }
```

#### `validateIntent(intent: StructuredIntent): Promise<boolean>`
Returns `true` if the intent is actionable (has a known type and domain).

---

### `monadforge.engine`

#### `run(options: { goal: string; context?: any }): Promise<AgentTaskResult>`
Runs a full autonomous agent task from a natural language goal.
```typescript
const result = await monadforge.engine.run({ goal: "Audit and deploy a staking contract" });
console.log(result.success);      // boolean
console.log(result.deployments);  // DeploymentRecord[]
console.log(result.repaired);     // boolean — true if auto-repair was applied
```

#### `continue(options: { projectId: string; prompt: string }): Promise<AgentTaskResult>`
Resumes a previous agent task using its project ID and memory context.

---

### `monadforge.actions`

#### `deploy(compiledArtifact, network?): Promise<PrimitiveOutput<DeploymentResult>>`
Deploys a compiled contract artifact to the network.
```typescript
const compResult = await monadforge.actions.compile({ "contracts/Token.sol": source });
const deployResult = await monadforge.actions.deploy(compResult, "monad-testnet");
console.log(deployResult.metadata.contractAddress);
console.log(deployResult.metadata.transactionHash);
console.log(deployResult.metadata.gasUsed); // real on-chain receipt value
```

#### `call(contractAddress, method, parameters): Promise<PrimitiveOutput<any>>`
Calls a contract function (read or write).
```typescript
const result = await monadforge.actions.call("0xABC...", "balanceOf(address)", ["0xDEF..."]);
```

#### `mint(contractAddress, to, amount): Promise<PrimitiveOutput<...>>`
Mints tokens via the `mint(address, uint256)` function.

#### `stake(contractAddress, amount): Promise<PrimitiveOutput<...>>`
Stakes tokens via the `stake()` or `stake(uint256)` function.

---

### `monadforge.actions.flow` — Value Flow API

The flow namespace provides primitives for building value-guided, self-monetizing on-chain agents using structured value flows.

#### `createFlow(options): Promise<FlowObject>`
Creates a value flow session with a deterministic ID and EIP-681 payment URL.
```typescript
const flowObj = await monadforge.actions.flow.createFlow({
  amount: "1000000000000000000", // 1 MON in wei
  recipient: "0xRecipient...",
  tokenAddress: "0xERC20Token...", // omit for native MON
  description: "Task execution flow",
});
// Returns:
// {
//   flowId: "fl_abc123...",
//   paymentUrl: "ethereum:0xToken/transfer?address=0xRecipient&uint256=1000...",
//   challenge: "Flow Execution Required: Pay 1000... MON to 0xRecipient...",
//   status: "pending"
// }
```

#### `executeFlow(flowId, privateKey, recipient, amount, tokenAddress?): Promise<FlowResult>`
Executes the value flow on-chain. Uses real `actionLayer.transfer` when a valid private key is provided; falls back to mock in test environments.
```typescript
const execution = await monadforge.actions.flow.executeFlow(
  flowObj.flowId,
  process.env.DEPLOYER_PRIVATE_KEY!,
  flowObj.recipient,
  flowObj.amount,
  flowObj.tokenAddress,
);
console.log(execution.transactionHash); // real on-chain tx hash
console.log(execution.status);          // "success" | "failed"
```

#### `verifyFlow(txHash, expectedAmount, recipient): Promise<boolean>`
Verifies an on-chain value flow execution by fetching the transaction receipt and confirming the `to` address. Uses the configured `MONAD_RPC_URL`.
```typescript
const verified = await monadforge.actions.flow.verifyFlow(
  execution.transactionHash,
  flowObj.amount,
  flowObj.recipient,
);
```

---

### `monadforge.tools`

#### `audit(contractSource: string): Promise<AuditReport>`
Runs the full 19-rule static security audit (AST-based with regex fallback).
```typescript
const report = await monadforge.tools.audit(soliditySource);
console.log(report.riskScore);  // 0–100
console.log(report.issues);     // AuditIssue[]
```

#### `repair(code: string, issues: string[]): Promise<RepairResult>`
Auto-applies fixes for detected issues. Handles: access control, reentrancy, MONAD-001 (parallel EVM), ECON-001/002 (oracle/flash-loan).
```typescript
const fixed = await monadforge.tools.repair(soliditySource, ["MONAD-001", "REENTRANCY-001"]);
console.log(fixed.fixedCode);
console.log(fixed.log); // description of applied fixes
```

#### `createProject(options): Promise<ProjectConfig>`
Initializes a new project directory structure.

#### `compose(goal: string): Promise<CompositionPlan>`
Composes a skill execution plan from a natural language goal.

#### `review(contracts: Record<string, string>): Promise<ArchitectureReport>`
Reviews the overall contract architecture for patterns and improvements.

---

## MCP Server Integration

Connect MonadForge AI directly to Cursor, Claude Desktop, or Windsurf.

### Cursor
1. **Cursor Settings → Features → MCP**
2. Click **+ Add New MCP Server**
3. Set command: `node /absolute/path/to/node_modules/@monadforge/ai/mcp/dist/index.js`

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "monadforge": {
      "command": "node",
      "args": ["/absolute/path/to/node_modules/@monadforge/ai/mcp/dist/index.js"],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "0x...",
        "MONAD_RPC_URL": "https://testnet-rpc.monad.xyz"
      }
    }
  }
}
```

### Windsurf
Add to your workspace `.windsurf/mcp.json`:
```json
{
  "servers": {
    "monadforge": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"]
    }
  }
}
```

---

## Monad-Specific Features

### Parallel EVM Optimization (MONAD-001)

Monad processes transactions in parallel using an optimistic execution engine. Contracts that modify **shared global state variables** (e.g., `uint256 public totalSupply`) cause storage slot conflicts and speculative rollbacks, degrading throughput.

MonadForge AI automatically detects (`MONAD-001`) and repairs these patterns:

**Before (sequential contention):**
```solidity
uint256 public counter;
function increment() external { counter++; }
```

**After (parallel-safe):**
```solidity
mapping(address => uint256) public counterPartition;
function increment() external { counterPartition[msg.sender]++; }
```

The repair engine handles `uint256`, `uint128`, `uint64`, `uint32`, `int256`, `int128`, and also updates `emit` and `return` statements that reference the renamed variable.

### Flash Loan & Oracle Security (ECON-001 — ECON-005)

| Rule | Attack Vector |
|---|---|
| `ECON-001` | Spot price oracle (getReserves) manipulation via flash loan |
| `ECON-002` | Unverified flash loan callback (drainable by anyone) |
| `ECON-003` | Sandwich attack on swaps without slippage guard |
| `ECON-004` | ERC-4626 first-depositor share inflation via raw balanceOf |
| `ECON-005` | Price calculation errors from unchecked token.decimals() |

---

## Publishing / CI

Releases are automated via GitHub Actions. Tag a release to trigger publish:

```bash
git tag v1.0.1
git push origin v1.0.1
# Triggers .github/workflows/publish.yml → npm publish @monadforge/ai
```

Requires `NPM_TOKEN` secret set in GitHub repository settings.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — see [LICENSE](LICENSE).
