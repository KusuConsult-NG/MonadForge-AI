# Monad Agent Standard (MAS): Enforceable Specifications

This document outlines the standard schemas defined in the Monad Agent Standard (MAS). These schemas are programmatically enforced at runtime via Zod validation within the `@monadforge/sdk` package.

---

## 1. Schema Specifications

### A. Skill Schema (`skill.schema.json`)
Standardizes capability registration. Every skill manifest must declare its required inputs and expected output formats to allow the planner to correctly route workflows.

### B. Plan Schema (`plan.schema.json`)
Defines the step-by-step developer intent breakdown. Every plan contains a series of topological step instructions containing `id`, `description`, `skillName`, `params`, and `status`.

### C. Memory Schema (`memory.schema.json`)
Structures local project state persistence to maintain context across sessions. It tracks contract locations, deployments, and previous decisions.

### D. Repair Schema (`repair.schema.json`)
Enforces the format of self-healing patch operations, logging the `originalCode`, `repairedCode`, identified `issues`, and a developer `explanation`.

### E. Deployment Schema (`deployment.schema.json`)
Defines compiler output structures and broadcast metadata returned by the action layer, including `contractAddress`, `transactionHash`, `gasUsed`, and `verificationStatus`.

### F. Execution Trace Schema (`trace.schema.json`)
A complete, inspectable log of an individual agent run. It compiles the intent, plan, executed steps with inputs/outputs, repairs, deployments, and the explainability rationales.

---

## 2. Programmatic Validation Example

Other tooling providers can implement MAS independently in any language using our JSON schemas. Within Node/TypeScript, validation is enforced at runtime:

```typescript
import { PlanSchema } from "@monadforge/sdk";

const plan = {
  steps: [
    {
      id: 1,
      description: "Deploy SimpleStaking",
      skillName: "deploy_contract",
      params: { contractName: "SimpleStaking" },
      status: "pending"
    }
  ]
};

// Enforces validation at runtime
try {
  PlanSchema.parse(plan);
  console.log("Plan conforms strictly to MAS!");
} catch (error) {
  console.error("Invalid plan structure:", error.errors);
}
```
