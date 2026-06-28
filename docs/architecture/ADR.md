# MONADFORGE - ARCHITECTURE DECISION RECORDS (ADR)

## VERSION 1.0

### PURPOSE

This document defines the permanent architectural decisions governing MonadForge.

No Automated coding system, contributor, contractor, engineer, or automation tool may override these decisions without creating a new ADR.

These ADRs exist to prevent architectural drift.

---

# ADR-001: Architecture Style
* **Decision:** MonadForge shall use a Flat Monorepo design structure.
* **Reason:** Allows separate NPM publishing of individual packages while keeping imports local and simple.
* **Benefits:** Modular testing, zero deployment overhead for local dev tools.
* **Status:** Approved

# ADR-002: Programming Language
* **Decision:** TypeScript shall be the primary language.
* **Reason:** Strong typing, compile-time checks, excellent autocomplete, and full compatibility with EVM tooling.
* **Status:** Approved

# ADR-003: Runtime Environment
* **Decision:** Node.js LTS
* **Reason:** Native integration with developer tools and robust support across macOS, Linux, and Windows.
* **Status:** Approved

# ADR-004: Automated Provider Strategy
* **Decision:** Provider Abstraction Layer (e.g. Gemini, OpenAI, Anthropic).
* **Forbidden:** Direct provider coupling or baking prompts into backend API calls.
* **Status:** Approved

# ADR-005: Smart Contract Language
* **Decision:** Solidity First
* **Reason:** Monad is fully EVM compatible.
* **Status:** Approved

# ADR-006: Data Storage
* **Decision:** Database-Free Execution
* **Reason:** Local developer toolkits should run instantly without requiring postgres/docker-compose setups.
* **Heuristics:** Store configuration in `monadforge.json`, log deployments to local `.monadforge/deployments.json` files.
* **Status:** Approved

# ADR-007: Vector Database
* **Decision:** Qdrant Client with Zero-Dependency Fallback
* **Reason:** Support RAG-based documentation lookups while permitting offline operations without a running server.
* **Status:** Approved

# ADR-008: Authentication
* **Decision:** None (Local execution model).
* **Status:** Approved

# ADR-009: Documentation Intelligence
* **Decision:** Local-indexed Knowledge Search
* **Status:** Approved

# ADR-010: Template-Based Contract Generation
* **Decision:** Synthesize smart contracts starting from audited templates (ERC20, ERC721, ERC1155, Vesting, Liquid Staking).
* **Status:** Approved

# ADR-011: Deployment Safety
* **Decision:** Deployments restricted to Monad Testnet and Local network nodes. Mainnet is disabled in Version 1.
* **Status:** Approved

# ADR-012: Security Auditing
* **Decision:** Mandatory Security Scan before Deployment. Critical/High issues block deployment.
* **Status:** Approved

# ADR-013: Code Quality
* **Decision:** All template outputs must compile and include automated test scripts.
* **Status:** Approved

# ADR-015: Logging Strategy
* **Decision:** JSON Structured Logging to console and log files.
* **Status:** Approved

# ADR-016: Error Handling
* **Decision:** Detailed, readable, and non-generic command errors.
* **Status:** Approved

# ADR-017: MCP Architecture
* **Decision:** Expose MonadForge engines via a Model Context Protocol (MCP) server over standard input/output (stdio).
* **Status:** Approved

# ADR-018: CLI Design
* **Decision:** Commander-based CLI (`monadforge`).
* **Status:** Approved

# ADR-019: Automated Node Governance
* **Decision:** Local operations require developer confirmation (e.g. manual approval prompt for testnet deployments).
* **Status:** Approved

# ADR-023: Testing Requirements
* **Decision:** All workspace changes require Jest testing. Mandatory global coverage threshold of 95%.
* **Status:** Approved

# ADR-025: Version 1 Success Definition
* **Version 1 succeeds only when:**
  1. Flat workspace modular architecture is preserved.
  2. CLI is database-free and provides `init`, `generate`, `audit`, `deploy`, `verify`, and `docs` commands.
  3. Static security scanner implements all 10 rules.
  4. Test coverage exceeds 95% globally.
* **Status:** Approved
