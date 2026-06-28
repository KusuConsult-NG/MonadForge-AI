# Monad Node Standard (MNS): Skill Registry Specification

Version: `1.0.0`
Status: **Proposed**

This specification defines the registry model, packaging formats, and discovery protocols for community-developed skills on the **MonadForge** execution runtime.

---

## 1. Architectural Philosophy

Automated nodes require a modular, standard interface to discover, load, and execute capabilities. By formalizing the skill packaging layout, we enable the community to build, share, and register custom integrations (e.g., lending pools, liquidity bridges, oracle feeds) that any MNS-conformant node can instantly ingest.

---

## 2. Skill Package Structure

Every skill must be packaged as a self-contained directory (or npm module under the `@monadforge-skills/` scope) containing:
1. `skill.json`: The manifest file declaring metadata, input validation schemas, and output formats.
2. `dist/index.js` (or `src/index.ts`): The execution handler logic.

```
@monadforge-skills/my-lending-skill/
├── skill.json
├── package.json
├── dist/
│   ├── index.js
│   └── index.d.ts
└── README.md
```

---

## 3. Skill Manifest Specification (`skill.json`)

The manifest defines the validation contract between the node and the skill. It must strictly validate against the MNS `SkillSchema`:

```json
{
  "$schema": "https://monadforge.automated/schemas/mas/skill.schema.json",
  "name": "borrow_assets",
  "version": "1.0.0",
  "description": "Borrow assets from a lending protocol on Monad.",
  "inputs": {
    "type": "object",
    "properties": {
      "assetAddress": {
        "type": "string",
        "description": "The ERC20 contract address of the asset to borrow."
      },
      "amount": {
        "type": "string",
        "description": "The token amount to borrow (in base units)."
      },
      "collateralAddress": {
        "type": "string",
        "description": "The contract address of the supplied collateral."
      }
    },
    "required": ["assetAddress", "amount", "collateralAddress"]
  },
  "outputs": {
    "type": "object",
    "properties": {
      "transactionHash": {
        "type": "string"
      },
      "borrowedAmount": {
        "type": "string"
      },
      "healthFactor": {
        "type": "string"
      }
    },
    "required": ["transactionHash", "borrowedAmount"]
  }
}
```

---

## 4. Handler Interface & Execution

Every skill package must export a default class or execution handler conforming to the following TypeScript interface:

```typescript
export interface SkillHandler<I = any, O = any> {
  execute(inputs: I, context?: any): Promise<O>;
}
```

Example implementation:

```typescript
import { SkillHandler } from "@monadforge/sdk";

export default class BorrowAssetsHandler implements SkillHandler {
  async execute(inputs: any, context?: any): Promise<any> {
    // 1. Derives wallet/broadcaster
    // 2. Encodes contract call ABI
    // 3. Broadcasts transaction to Monad RPC
    return {
      transactionHash: "0x...",
      borrowedAmount: inputs.amount,
      healthFactor: "1.85",
    };
  }
}
```

---

## 5. Registry Discovery Protocol

### A. Local Discovery
The node runtime resolves local skill directories by reading the `.monadforge/skills/` workspace folder:
1. Scans `.monadforge/skills/*/skill.json`.
2. Registers matching manifests dynamically.

### B. Registry Distribution (npm)
Community skills are published to npm using the `@monadforge-skills/` scope.
To load a registry-based skill, the developer updates their project config:
```json
{
  "name": "my-node-project",
  "dependencies": {
    "@monadforge-skills/borrow-assets": "^1.0.0"
  }
}
```
At runtime, the router loads modules matched by registry scope configurations.
