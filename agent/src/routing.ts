import { createLogger } from "@monadforge/sdk";
import { MonetizedExecutor, PaymentDetails } from "./monetization";
import { AgentIdentity } from "./manifest";

const logger = createLogger("Routing");

export class AgentRouter {
  private static localRegistry = new Map<string, any>();
  private static localExecutor = new MonetizedExecutor();

  public static registerAgent(agentId: string, manifest: any): void {
    this.localRegistry.set(agentId, manifest);
    logger.info(`Registered agent '${agentId}' in router database.`);
  }

  public static async invokeAgent(
    targetAgentId: string,
    skillName: string,
    params: Record<string, any>,
    paymentDetails?: PaymentDetails,
    context?: any
  ): Promise<any> {
    logger.info(`Routing request to agent '${targetAgentId}' for skill '${skillName}'`);

    if (targetAgentId === "monadforge-ai" || targetAgentId === "monadforge") {
      return this.localExecutor.executeSkill(skillName, params, paymentDetails, context);
    }

    const remoteAgent = this.localRegistry.get(targetAgentId);
    if (!remoteAgent) {
      throw new Error(`Target agent '${targetAgentId}' not found in registry.`);
    }

    logger.info(`Simulating remote call to agent '${targetAgentId}' for skill '${skillName}'`);
    if (remoteAgent.pricing?.[skillName] && parseFloat(remoteAgent.pricing[skillName].price) > 0) {
      if (!paymentDetails) {
        throw new Error(`Agent '${targetAgentId}' requires payment for skill '${skillName}'.`);
      }
    }

    return {
      status: "success",
      message: `Simulated response from remote agent ${targetAgentId} for skill ${skillName}`,
      output: {
        agentId: targetAgentId,
        skill: skillName,
        timestamp: new Date().toISOString(),
        mockData: true
      }
    };
  }

  public static clearRegistry(): void {
    this.localRegistry.clear();
  }

  public static getRegisteredAgents(): Record<string, any> {
    const agents: Record<string, any> = {
      "monadforge-ai": AgentIdentity.getManifest()
    };
    for (const [id, manifest] of this.localRegistry.entries()) {
      agents[id] = manifest;
    }
    return agents;
  }
}

