import { z } from "zod";

// 1. Skill Schema (Metadata declaring capabilities)
export const SkillSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  inputs: z.object({
    type: z.literal("object"),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
  }),
  outputs: z.object({
    type: z.literal("object"),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
  }),
  pricing: z.object({
    price: z.string(),
    token: z.string(),
  }).optional(),
  permissions: z.array(z.string()).optional(),
  executionRequirements: z.record(z.any()).optional(),
});

// Skill Package Schema (Skill packaging layer)
export const SkillPackageSchema = z.object({
  skill: z.string(),
  version: z.string(),
  category: z.string(),
  schema: SkillSchema,
}).passthrough();

// Agent Manifest Schema (Agent Identity Layer, ERC-8004 aligned)
export const AgentManifestSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
  pricing: z.record(z.object({
    price: z.string(),
    token: z.string(),
  })).optional(),
  permissions: z.array(z.string()).optional(),
  reputation: z.object({
    score: z.number().optional(),
    totalExecutions: z.number().optional(),
    successRate: z.number().optional(),
  }).optional(),
}).passthrough();

// 2. Plan Step Schema
export const PlanStepSchema = z.object({
  id: z.number(),
  description: z.string(),
  skillName: z.enum([
    "generate_contract",
    "run_audit",
    "deploy_contract",
    "verify_contract",
    "search_docs",
    "execute_action",
  ]),
  params: z.record(z.any()),
  status: z.enum(["pending", "in_progress", "completed", "failed", "success"]),
});

// 3. Planning Schema (Execution Plan)
export const PlanSchema = z.object({
  steps: z.array(PlanStepSchema),
});

// 4. Memory Schema (Serialized project state)
export const MemorySchema = z.object({
  projectId: z.string(),
  contracts: z.record(z.string()),
  deployments: z.array(
    z.object({
      projectId: z.string().optional(),
      network: z.string().optional(),
      contractAddress: z.string().optional(),
      transactionHash: z.string().optional(),
      status: z.string().optional(),
      timestamp: z.string().optional(),
    }).passthrough()
  ),
  detectedIssues: z.array(z.string()).optional(),
}).passthrough();

// 5. Repair Schema (Self-healing patch logs)
export const RepairSchema = z.object({
  originalCode: z.string(),
  repairedCode: z.string(),
  issues: z.array(z.string()),
  explanation: z.string().optional(),
});

// 6. Low-level Execution/Deployment Schema
export const DeploymentResultSchema = z.object({
  contractAddress: z.string(),
  transactionHash: z.string(),
  gasUsed: z.string(),
  status: z.enum(["success", "failed"]),
  errors: z.array(z.string()).optional(),
  verificationStatus: z.string().optional(),
  verificationMessage: z.string().optional(),
  implementationVerificationStatus: z.string().optional(),
  implementationVerificationMessage: z.string().optional(),
});

// 7. Full Execution Trace Schema (Inspectable agent run logs)
export const ExecutionTraceSchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
  timestamp: z.string(),
  intent: z.any(),
  plan: PlanSchema,
  stepsExecuted: z.array(
    z.object({
      stepId: z.number(),
      skillName: z.string(),
      input: z.any(),
      output: z.any(),
      durationMs: z.number(),
      timestamp: z.string(),
    })
  ),
  repairs: z.array(RepairSchema),
  deployments: z.array(DeploymentResultSchema),
  explainabilityRationale: z.string().optional(),
  finalStatus: z.enum(["success", "failed"]),
});
