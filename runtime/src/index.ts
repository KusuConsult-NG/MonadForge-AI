import { createLogger } from "@monadforge/sdk";
import { IntentEngine, StructuredIntent } from "@monadforge/intent";
import { PlanningEngine, ExecutionPlan } from "@monadforge/plan";
import { AgentSkills } from "@monadforge/skills";

const logger = createLogger("RuntimeEngine");

export interface ExecutionResult {
  prompt: string;
  intent: StructuredIntent;
  plan: ExecutionPlan;
  results: Array<{
    stepId: number;
    description: string;
    success: boolean;
    result?: any;
    error?: string;
  }>;
  success: boolean;
}

export class RuntimeEngine {
  private intentEngine = new IntentEngine();
  private planningEngine = new PlanningEngine();
  private skills = new AgentSkills();

  public async execute(
    prompt: string,
    context?: any,
  ): Promise<ExecutionResult> {
    logger.info(`Starting execution pipeline for prompt: "${prompt}"`, {
      operation: "execute",
    });

    // 1. Intent Parsing
    const intent = await this.intentEngine.parse(prompt);

    // 2. Planning
    const plan = await this.planningEngine.createPlan(intent);

    const results: ExecutionResult["results"] = [];
    let success = true;

    // 3. Execution (Skill Routing)
    for (const step of plan.steps) {
      step.status = "in_progress";
      logger.info(`Running plan step ${step.id}: ${step.description}`, {
        stepId: step.id,
      });

      try {
        const res = await this.skills.route(
          step.skillName,
          step.params,
          context,
        );
        step.status = "completed";
        results.push({
          stepId: step.id,
          description: step.description,
          success: true,
          result: res,
        });
      } catch (error: any) {
        step.status = "failed";
        logger.error(`Plan step ${step.id} failed: ${error.message}`, error);
        results.push({
          stepId: step.id,
          description: step.description,
          success: false,
          error: error.message,
        });
        success = false;
        // Abort pipeline immediately on failure (e.g. Audit blocking deploy)
        break;
      }
    }

    return {
      prompt,
      intent,
      plan,
      results,
      success,
    };
  }
}
