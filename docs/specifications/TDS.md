# MONADFORGE - TECHNICAL DESIGN SPECIFICATION (TDS)

## VOLUME 1: FOUNDATION & SPRINT 1

### SECTION 1: SYSTEM OVERVIEW
MonadForge is an Automated developer toolkit for the Monad ecosystem, providing local-only, database-free compilation, templates, security analysis, deployment, and documentation tools.

* **Primary objective:** Transform natural language instructions and local developer workflows into compiled, audited, and deployed Monad smart contracts.
* **Version 1 Scope:** MCP Server, Knowledge Engine, Template Engine, Deployment Engine, Audit Engine, Wallet Engine (integrated in deploy), CLI.
* **Version 1 Exclusions:** SaaS Architecture, Multi-Tenant Database, User Authentication, Marketplace, Admin Panels.

---

### SECTION 2: ROOT REPOSITORY STRUCTURE
```
monadforge/
├── cli/          # Command-line interface package (monadforge)
├── mcp/          # Model Context Protocol server exposing tools to Automated editors
├── sdk/          # Core SDK with shared configs, log context, and vector client wrappers
├── templates/    # Smart contract templates and metadata generator
├── deploy/       # Smart contract compilation, wallet engine, and deployment coordinator
├── audit/        # Static security audit scanning engine
├── knowledge/    # authoritative documentation search and indexing engine
├── skills/       # Automated developer node prompt skills
├── docs/         # Architecture and technical specifications
└── tests/        # Integration and E2E test suites
```

---

### SECTION 3: PACKAGE RESPONSIBILITIES
* **@monadforge/cli:** Commander-based terminal interface. Manages interactive developer workflows, prompts, configuration setups, and formats outputs.
* **@monadforge/mcp:** MCP server enabling Automated coding assistants (e.g. Cursor, Claude Desktop) to invoke native Monad tools.
* **@monadforge/sdk:** Common configuration validation, logging context handlers, and Qdrant client adapters.
* **@monadforge/templates:** ERC20, ERC721, ERC1155, Vesting, and Liquid Staking Solidity contract files, deployment script templates, and Jest tests.
* **@monadforge/deploy:** Solc compiler and EVM Wallet execution engine. Handles transaction generation, signing, and RPC broadcasting.
* **@monadforge/audit:** Rules-based static scanner analyzing vulnerability patterns including Reentrancy, Access Control, Dangerous Calls, block.timestamp dependency, and state shadowing.
* **@monadforge/knowledge:** RAG search indexer supporting both a real Qdrant connection and a zero-dependency local fallback mock.

---

### SECTION 4: DATABASE DESIGN
* **Database-Free Design:** MonadForge requires **no external SQL database** for operation.
* **Local Logs:** Deployment events and metadata are written locally to the project directory under `.monadforge/deployments.json`.
* **Configuration:** Project metadata is loaded from local `monadforge.json` files and environment variables.

---

### SECTION 5: VECTOR DATABASE DESIGN
* **Provider:** Qdrant (optional, with zero-dependency offline mock client fallback).
* **Collections:** `documentation`

---

### SECTION 6: MCP SERVER
* **Folder:** `mcp/`
* **Tools:** `get_balance`, `get_transaction`, `estimate_gas`, `deploy_contract`, `call_contract`, `verify_contract`

---

### SECTION 7: KNOWLEDGE ENGINE
* **Folder:** `knowledge/`
* **Responsibilities:** Search index querying, document chunk parsing, and reference citing.

---

### SECTION 8: TEMPLATE ENGINE
* **Folder:** `templates/`
* **Template Categories:** ERC20, ERC721, ERC1155, Vesting, Liquid Staking, Multisig, Staking, DAO.

---

### SECTION 9: DEPLOYMENT ENGINE
* **Folder:** `deploy/`
* **Functions:** `compile()`, `deployToTestnet()`, `verifyDeployment()`

---

### SECTION 10: WALLET ENGINE
* **Folder:** Consolidated inside `deploy/src/index.ts`
* **Functions:** Private key importing, transaction signing, and balance checks.

---

### SECTION 11: AUDIT ENGINE
* **Folder:** `audit/`
* **Checks:** Access Control, Ownership Validation, Reentrancy, Integer Overflow (older pragmas), Unchecked Low-Level Calls, Gas Optimization, tx.origin authorization, Unchecked ERC20 Transfers, block.timestamp randomness/timing dependencies, State Variable Shadowing, and Parallel EVM Storage Slot Contention (`MONAD-001`).

---

### SECTION 12: CLI SPECIFICATION
* **Folder:** `cli/`
* **Commands:** `monadforge init`, `monadforge generate <templateType>`, `monadforge deploy [projectId]`, `monadforge audit <filePath>`, `monadforge verify <contractAddress>`, `monadforge docs <query>`.

---

### SECTION 13: LOGGING STANDARD
* **Required Fields:** `timestamp`, `module`, `severity`, `message`, `operation`, `status`
* **Severity Levels:** DEBUG, INFO, WARNING, ERROR, CRITICAL

---

### SECTION 14: SECURITY REQUIREMENTS
* **Secrets:** Private keys must never be logged or stored in version-controlled source files.
* **Testnet Safety:** Mainnet deployment is disabled in V1; all remote actions target Monad Testnet.
* **Pre-deployment Scan:** Deployments are blocked if critical or high severity vulnerabilities are found.

---

### SECTION 15: TESTING FRAMEWORK
* **Unit Tests:** Jest suite running across all workspace packages with a mandatory global coverage threshold of 95% (currently >99% statements, 100% branches/functions).

---

### SECTION 16: SPRINT 1 DELIVERABLES
* **Goal:** Working local developer toolkit.
* **Deliverables:** Flat Workspace, Zero-DB CLI, Dynamic Compile & Deploy, Static Scanner with 10 Rules, Vector DB Local Fallback, MCP Server, Unit Test Coverage >95%.
