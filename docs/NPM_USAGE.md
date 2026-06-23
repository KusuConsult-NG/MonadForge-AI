# MonadForge AI npm Package Usage Guide

The `@monadforge/ai` package provides unified access to all core engines, CLI binaries, and TypeScript declaration files for developer integration.

---

## Installation

Install the package via npm or yarn:

```bash
# Local installation
npm install @monadforge/ai

# Global installation (recommended for CLI usage)
npm install -g @monadforge/ai
```

---

## SDK Usage (Importing Engines)

You can import any core engine module directly into your TypeScript or JavaScript application:

```typescript
import {
  IntentEngine,
  PlanningEngine,
  AgentSkills,
  ActionLayer,
  MemoryEngine,
  RepairEngine,
  SkillCompositionEngine,
  KnowledgeEngine,
  RuntimeEngine,
  ArchitectureReviewEngine
} from '@monadforge/ai';

// 1. Parse Developer Intent
const intentEngine = new IntentEngine();
const intent = await intentEngine.parse("Create an ERC20 token ForgeToken symbol FORGE supply 1000000");
console.log(intent.domain); // "erc20"
console.log(intent.params.name); // "ForgeToken"

// 2. Generate execution plans
const planningEngine = new PlanningEngine();
const plan = await planningEngine.generatePlan(intent);
console.log(plan.steps); // Checklist steps

// 3. Resolve and route skills
const skills = new AgentSkills();
const result = await skills.route("generate_contract", {
  name: "ForgeToken",
  symbol: "FORGE",
  templateType: "erc20"
});

// 4. Perform architectural and security reviews
const reviewEngine = new ArchitectureReviewEngine();
const securityReview = await reviewEngine.reviewSecurityModel(result.contracts["contracts/Token.sol"]);
console.log(securityReview);
```

---

## CLI Usage

MonadForge AI exposes the `monadforge` binary.

### 1. Project Initialization
Initialize a new local project structure, config files, and memory system:

```bash
npx @monadforge/ai init --name my-monad-project
```

### 2. File and Smart Contract Generation
Generate a Solidity contract from built-in templates (e.g., erc20, erc721, staking, dao, amm):

```bash
npx @monadforge/ai generate erc20 --name ForgeToken --symbol FORGE --supply 1000000
```

### 3. Static Code Audit
Audit smart contracts inside the directory to detect security flaws:

```bash
npx @monadforge/ai audit contracts/Token.sol
```

### 4. Deploy Contracts
Compile and deploy the project's contracts to the Monad Testnet:

```bash
export DEPLOYER_PRIVATE_KEY="0x..."
npx @monadforge/ai deploy
```

---

## Module Export Structure

The package exports type definitions and classes matching the Monad Agent Standard (MAS):

```typescript
// Type Declarations
export interface StructuredIntent {
  type: 'generate' | 'deploy' | 'audit' | 'verify' | 'docs' | 'action';
  domain: 'erc20' | 'erc721' | 'erc1155' | 'staking' | 'dao' | 'amm' | 'unknown';
  params: Record<string, any>;
  constraints: string[];
}

export interface ExecutionPlan {
  projectId: string;
  goal: string;
  steps: Array<{
    id: string;
    skill: string;
    params: Record<string, any>;
    status: 'pending' | 'completed' | 'failed';
  }>;
}
```
