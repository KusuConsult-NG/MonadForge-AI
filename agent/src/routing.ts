import { createLogger, getConfig } from "@monadforge/sdk";
import { MonetizedExecutor, PaymentDetails } from "./monetization";
import { AgentIdentity } from "./manifest";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";



const logger = createLogger("Routing");

export class AgentRouter {
  private static localRegistry = new Map<string, any>();
  private static localExecutor = new MonetizedExecutor();
  private static registryLoaded = false;

  private static getPeersFilePath(): string {
    return path.resolve(process.cwd(), ".monadforge", "peers.json");
  }

  private static ensureRegistryLoaded(): void {
    if (this.registryLoaded) {
      return;
    }
    this.registryLoaded = true;
    try {
      const filePath = this.getPeersFilePath();
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        for (const [agentId, manifest] of Object.entries(data)) {
          this.localRegistry.set(agentId, manifest);
        }
        logger.info(`Loaded ${Object.keys(data).length} peer agent manifests from persistent storage.`);
      }
    } catch (err: any) {
      logger.error("Failed to load peer agents from persistent file", err);
    }
  }

  private static persistRegistry(): void {
    try {
      const filePath = this.getPeersFilePath();
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const data: Record<string, any> = {};
      for (const [id, manifest] of this.localRegistry.entries()) {
        data[id] = manifest;
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      logger.info(`Persisted ${this.localRegistry.size} peer agent manifests to ${filePath}.`);
    } catch (err: any) {
      logger.error("Failed to persist peer agents to file", err);
    }
  }

  public static registerAgent(agentId: string, manifest: any): void {
    this.ensureRegistryLoaded();
    this.localRegistry.set(agentId, manifest);
    logger.info(`Registered agent '${agentId}' in router database.`);
    this.persistRegistry();
  }

  public static async invokeAgent(
    targetAgentId: string,
    skillName: string,
    params: Record<string, any>,
    paymentDetails?: PaymentDetails,
    context?: any
  ): Promise<any> {
    this.ensureRegistryLoaded();
    logger.info(`Routing request to agent '${targetAgentId}' for skill '${skillName}'`);

    if (targetAgentId === "monadforge-ai" || targetAgentId === "monadforge") {
      return this.localExecutor.executeSkill(skillName, params, paymentDetails, context);
    }

    let remoteAgent = this.localRegistry.get(targetAgentId);

    if (!remoteAgent && process.env.AGENT_REGISTRY_ADDRESS) {
      logger.info(`Agent '${targetAgentId}' not found locally. Querying Registry contract at ${process.env.AGENT_REGISTRY_ADDRESS}`);
      try {
        const config = getConfig();
        const provider = new ethers.JsonRpcProvider(config.MONAD_RPC_URL);
        const registryAbi = [
          "function getAgent(string agentId) external view returns (string name, string endpointUrl, string manifestJson)"
        ];
        const registryContract = new ethers.Contract(process.env.AGENT_REGISTRY_ADDRESS, registryAbi, provider);
        const [name, endpointUrl, manifestJson] = await registryContract.getAgent(targetAgentId);
        
        if (name || endpointUrl || manifestJson) {
          let parsedManifest = {};
          try {
            parsedManifest = JSON.parse(manifestJson);
          } catch {}
          
          remoteAgent = {
            agentId: targetAgentId,
            name: name || targetAgentId,
            endpointUrl: endpointUrl || "",
            ...parsedManifest
          };
          this.localRegistry.set(targetAgentId, remoteAgent);
          this.persistRegistry();
          logger.info(`Dynamically registered peer '${targetAgentId}' from on-chain Registry.`);
        }
      } catch (err: any) {
        logger.error(`On-chain Registry query failed for '${targetAgentId}'`, err);
      }
    }

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
    this.registryLoaded = false;
    try {
      const filePath = this.getPeersFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err: any) {
      logger.error("Failed to delete peers file during clearRegistry", err);
    }
  }

  public static getRegisteredAgents(): Record<string, any> {
    this.ensureRegistryLoaded();
    const agents: Record<string, any> = {
      "monadforge-ai": AgentIdentity.getManifest()
    };
    for (const [id, manifest] of this.localRegistry.entries()) {
      agents[id] = manifest;
    }
    return agents;
  }
}

