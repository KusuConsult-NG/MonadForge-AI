import { createLogger, getConfig } from "@monadforge/sdk";
import { MonetizedExecutor, PaymentDetails } from "./monetization";
import { AgentIdentity } from "./manifest";
import { ethers } from "ethers";


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

    if (remoteAgent.endpointUrl) {
      logger.info(`Sending real network request to agent '${targetAgentId}' at ${remoteAgent.endpointUrl}`);
      const payloadObj = {
        skillName,
        params,
        paymentDetails,
        timestamp: Date.now().toString()
      };
      const payloadStr = JSON.stringify(payloadObj);

      const config = getConfig();
      let privateKey = config.DEPLOYER_PRIVATE_KEY;
      if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        privateKey = "0x0123456789012345678901234567890123456789012345678901234567890123";
      }
      const wallet = new ethers.Wallet(privateKey);
      const senderAddress = wallet.address;
      const signature = await wallet.signMessage(payloadStr);

      let url = remoteAgent.endpointUrl;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `http://${url}`;
      }
      if (!url.endsWith("/invoke")) {
        url = `${url.replace(/\/$/, "")}/invoke`;
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agent-Signature": signature,
            "X-Agent-Sender": senderAddress
          },
          body: payloadStr
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(`HTTP error ${response.status}: ${errBody.error || response.statusText}`);
        }

        const resJson = await response.json();
        return resJson.result;
      } catch (err: any) {
        logger.error(`Failed to invoke remote agent at ${url}`, err);
        throw err;
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

