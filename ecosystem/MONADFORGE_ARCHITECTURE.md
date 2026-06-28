# MonadForge: Technical Architecture

This document describes the modular architecture of the **MonadForge** execution runtime and details how each engine conforms to the **Monad Node Standard (MNS)**.

---

## 1. Modular Subsystem Layout

MonadForge is organized as a monorepo consisting of private modular packages, compiled into a single public bundle (`@monadforge/automated`):

### A. Intent Engine (`@monadforge/intent`)
Parses unstructured natural language prompts into typed parameter objects. It validates outputs against `StructuredIntentSchema`.

### B. Planning & Composition Engine (`@monadforge/plan` & `@monadforge/composition`)
Generates topological task compositions. It matches goals against available skills and plans execution steps in a directed acyclic graph (DAG). Verified against `PlanSchema`.

### C. Actions Layer (`@monadforge/actions`)
Handles low-level Solidity compilation, wallet derivation, RPC broadcasting, gas fee overrides (dynamic `maxPriorityFeePerGas` calculations), and automatically verifies contract bytecode on Monad block explorer APIs. Outputs comply with `DeploymentResultSchema`.

### D. Self-Healing Repair Engine (`@monadforge/repair`)
Listens to runtime transaction/compilation failures and applies targeted AST-based or regular-expression modifications to source codes, executing closed-loop retries. Outputs comply with `RepairSchema`.

### E. Memory & Tracing Engine (`@monadforge/memory`)
Serializes local workspace context (`.monadforge/memory/`) and registers chronological, replayable execution trace logs (`.monadforge/traces/`). Traces comply with `ExecutionTraceSchema`.

### F. smart Contract Audit Engine (`@monadforge/audit`)
Performs static analysis checks on Solidity ASTs, scanning for 15 risk categories including access control breaches and Parallel EVM slot contention patterns.

---

## 2. Node Workflow Lifecycle

```
 Developer Prompt (e.g., "Build a staking contract")
        │
        ▼
   [Intent Engine]  ──► Validates against StructuredIntentSchema
        │
        ▼
   [Planning Engine] ──► Generates Plan steps (conforming to PlanSchema)
        │
        ▼
[Composition Engine] ──► Compiles DAG & routes steps to skills
        │
        ├──► [Audit Engine] ──► Scans AST for vulnerabilities
        │         │
        │         ▼ (If bugs found)
        ├──► [Repair Engine] ──► Patches code (conforming to RepairSchema)
        │
        ▼
  [Actions Layer]   ──► Compiles, overrides gas fees, broadcasts to Monad
        │
        ▼
[Explorer Verify]   ──► Automatically posts source code to MonadScan
        │
        ▼
 [Memory Engine]    ──► Persists trace.json to .monadforge/traces/
```
