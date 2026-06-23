import { createLogger, PlanSchema } from "@monadforge/sdk";

const logger = createLogger("PlanningEngine");

export interface PlanStep {
  id: number;
  description: string;
  skillName:
    | "generate_contract"
    | "run_audit"
    | "deploy_contract"
    | "verify_contract"
    | "search_docs"
    | "execute_action";
  params: Record<string, any>;
  status: "pending" | "in_progress" | "completed" | "failed";
}

export interface ExecutionPlan {
  steps: PlanStep[];
}

export class PlanningEngine {
  public async createPlan(intent: any): Promise<ExecutionPlan> {
    logger.info(`Creating plan for intent: ${intent.type}`, {
      operation: "createPlan",
    });
    const steps: PlanStep[] = [];

    switch (intent.type) {
      case "generate":
        steps.push({
          id: 1,
          description: `Generate smart contract using ${intent.domain.toUpperCase()} template`,
          skillName: "generate_contract",
          params: { domain: intent.domain, ...intent.params },
          status: "pending",
        });
        steps.push({
          id: 2,
          description: `Run security audit on the generated contract`,
          skillName: "run_audit",
          params: { domain: intent.domain, ...intent.params },
          status: "pending",
        });
        break;
      case "deploy":
        steps.push({
          id: 1,
          description: `Run pre-deployment static security analysis on contracts`,
          skillName: "run_audit",
          params: intent.params,
          status: "pending",
        });
        steps.push({
          id: 2,
          description: `Deploy compiled contract to Monad Testnet`,
          skillName: "deploy_contract",
          params: intent.params,
          status: "pending",
        });
        break;
      case "audit":
        steps.push({
          id: 1,
          description: `Audit contract code at ${intent.params.filePath}`,
          skillName: "run_audit",
          params: intent.params,
          status: "pending",
        });
        break;
      case "verify":
        steps.push({
          id: 1,
          description: `Verify contract address ${intent.params.contractAddress}`,
          skillName: "verify_contract",
          params: intent.params,
          status: "pending",
        });
        break;
      case "docs":
        steps.push({
          id: 1,
          description: `Search Monad documentation for "${intent.params.query}"`,
          skillName: "search_docs",
          params: intent.params,
          status: "pending",
        });
        break;
      case "action":
        steps.push({
          id: 1,
          description: `Execute action ${intent.params.action}`,
          skillName: "execute_action",
          params: intent.params,
          status: "pending",
        });
        break;
    }

    const plan = { steps };
    PlanSchema.parse(plan);
    return plan;
  }
}
