# MonadForge: Golden Trace Reference

This document highlights the flagship end-to-end execution of **MonadForge** generating, auditing, repairing, deploying, and verifying a staking protocol on the Monad blockchain.

---

## 1. Flagship Demonstration Flow

The canonical example is recorded in [examples/golden-trace/trace.json](file:///Users/mac/MONADFORGE%20AI/examples/golden-trace/trace.json). It demonstrates a complete run starting from a single prompt with no manual developer intervention.

```
 Claude Desktop (Developer Console)
        │  "Build a staking protocol on Monad"
        ▼
 Model Context Protocol (MCP) Server
        │
        ▼
 MonadForge [Node Runtime Engine]
        │
        ├──► 1. Plan generated: [generate_contract] -> [run_audit] -> [deploy_contract]
        │
        ├──► 2. Contract written: SimpleStaking.sol (ReentrancyGuard applied)
        │
        ├──► 3. Security scan: Audit detects unprotected function and unchecked transfer
        │
        ├──► 4. Auto-Repair: Code patched in-memory (withdraw onlyOwner added)
        │
        ├──► 5. Deployment: Broadcasted to Monad Testnet RPC (custom gas optimized)
        │
        └──► 6. Verification: Bytecode posted and verified on block explorer API
```

---

## 2. Walkthrough of Generated Files

You can inspect the full golden trace artifacts:
1. **Replayable Trace**: View [trace.json](file:///Users/mac/MONADFORGE%20AI/examples/golden-trace/trace.json) to see the exact payload format defined by the Monad Node Standard (MNS).
2. **Audit & Self-Healing Explanation**: View [explanation.md](file:///Users/mac/MONADFORGE%20AI/examples/golden-trace/explanation.md) to read the explainability rationale explaining *why* decisions were made.
3. **Solidity Code**: View [SimpleStaking.sol](file:///Users/mac/MONADFORGE%20AI/examples/golden-trace/contracts/SimpleStaking.sol) to inspect the final, secured staking contract.
