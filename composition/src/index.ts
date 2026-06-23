import { createLogger } from "@monadforge/sdk";
import { AgentSkills } from "@monadforge/skills";

const logger = createLogger("SkillCompositionEngine");

export interface CompositionStep {
  id: string;
  skill: string;
  params: Record<string, any>;
  dependencies: string[];
}

export interface CompositionPlan {
  goal: string;
  steps: CompositionStep[];
}

export interface WorkflowResult {
  success: boolean;
  stepResults: Record<string, any>;
  errors?: string[];
}

export class SkillCompositionEngine {
  private agentSkills = new AgentSkills();

  public async composeSkills(goal: string): Promise<CompositionPlan> {
    logger.info(`Composing skills for goal: "${goal}"`, {
      operation: "composeSkills",
    });
    const normalized = goal.toLowerCase();
    const steps: CompositionStep[] = [];

    if (normalized.includes("dex") || normalized.includes("amm")) {
      steps.push(
        {
          id: "step-gen-token",
          skill: "generate_contract",
          params: {
            name: "DEXToken",
            symbol: "DEXT",
            domain: "erc20",
            supply: "1000000",
          },
          dependencies: [],
        },
        {
          id: "step-gen-amm",
          skill: "generate_contract",
          params: { name: "VibeAMM", symbol: "VIBEAMM", domain: "amm" },
          dependencies: [],
        },
        {
          id: "step-audit-token",
          skill: "run_audit",
          params: { code: "" }, // populated from step-gen-token
          dependencies: ["step-gen-token"],
        },
        {
          id: "step-audit-amm",
          skill: "run_audit",
          params: { code: "" }, // populated from step-gen-amm
          dependencies: ["step-gen-amm"],
        },
        {
          id: "step-deploy-token",
          skill: "deploy_contract",
          params: {},
          dependencies: ["step-audit-token"],
        },
        {
          id: "step-deploy-amm",
          skill: "deploy_contract",
          params: {},
          dependencies: ["step-audit-amm"],
        },
      );
    } else if (
      normalized.includes("marketplace") ||
      normalized.includes("nft")
    ) {
      steps.push(
        {
          id: "step-gen-nft",
          skill: "generate_contract",
          params: { name: "VibeNFT", symbol: "VNFT", domain: "erc721" },
          dependencies: [],
        },
        {
          id: "step-audit-nft",
          skill: "run_audit",
          params: { code: "" },
          dependencies: ["step-gen-nft"],
        },
        {
          id: "step-deploy-nft",
          skill: "deploy_contract",
          params: {},
          dependencies: ["step-audit-nft"],
        },
      );
    } else if (normalized.includes("staking")) {
      steps.push(
        {
          id: "step-gen-staking",
          skill: "generate_contract",
          params: {
            name: "SimpleStaking",
            symbol: "STAKE",
            domain: "staking",
            rewardToken: "0x00",
            stakingToken: "0x00",
          },
          dependencies: [],
        },
        {
          id: "step-audit-staking",
          skill: "run_audit",
          params: { code: "" },
          dependencies: ["step-gen-staking"],
        },
        {
          id: "step-deploy-staking",
          skill: "deploy_contract",
          params: {},
          dependencies: ["step-audit-staking"],
        },
      );
    } else {
      // Default fallback: Single contract generation, audit, and deploy
      steps.push(
        {
          id: "step-gen-default",
          skill: "generate_contract",
          params: { name: "VibeToken", symbol: "VTK", domain: "erc20" },
          dependencies: [],
        },
        {
          id: "step-audit-default",
          skill: "run_audit",
          params: { code: "" },
          dependencies: ["step-gen-default"],
        },
        {
          id: "step-deploy-default",
          skill: "deploy_contract",
          params: {},
          dependencies: ["step-audit-default"],
        },
      );
    }

    return { goal, steps };
  }

  public async executeWorkflow(
    plan: CompositionPlan,
    context?: any,
  ): Promise<WorkflowResult> {
    logger.info(`Executing workflow for goal: "${plan.goal}"`, {
      operation: "executeWorkflow",
    });
    const stepResults: Record<string, any> = {};
    const executed: Set<string> = new Set();
    const errors: string[] = [];

    // Helper: find next executable steps (whose dependencies are met)
    const getExecutableSteps = () => {
      return plan.steps.filter(
        (s) =>
          !executed.has(s.id) && s.dependencies.every((d) => executed.has(d)),
      );
    };

    let nextSteps = getExecutableSteps();
    while (nextSteps.length > 0) {
      for (const step of nextSteps) {
        try {
          logger.info(`Executing workflow step: ${step.id} (${step.skill})`);

          // Inject code inputs dynamically from generator steps to audit steps if needed
          if (step.skill === "run_audit") {
            const depGenStep = step.dependencies.find((d) =>
              d.startsWith("step-gen-"),
            );
            if (depGenStep && stepResults[depGenStep]) {
              const project = stepResults[depGenStep];
              const mainFile = Object.keys(project.contracts)[0];
              step.params.code = project.contracts[mainFile];
            }
          }

          const result = await this.agentSkills.route(
            step.skill,
            step.params,
            context,
          );
          stepResults[step.id] = result;
          executed.add(step.id);
        } catch (e: any) {
          logger.error(`Workflow step failed: ${step.id} (${e.message})`);
          errors.push(`Step ${step.id} failed: ${e.message}`);
          return { success: false, stepResults, errors };
        }
      }
      nextSteps = getExecutableSteps();
    }

    return {
      success: errors.length === 0 && executed.size === plan.steps.length,
      stepResults,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public async buildWorkflow(
    plan: CompositionPlan,
    context?: any,
  ): Promise<WorkflowResult> {
    return this.executeWorkflow(plan, context);
  }

  public async generateDependencyGraph(plan: CompositionPlan): Promise<string> {
    let graph = "graph TD\n";
    for (const step of plan.steps) {
      const label = `${step.id}["${step.skill}"]`;
      graph += `  ${step.id}${label}\n`;
      for (const dep of step.dependencies) {
        graph += `  ${dep} --> ${step.id}\n`;
      }
    }
    return graph;
  }
}
