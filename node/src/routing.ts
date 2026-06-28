import { createLogger, getConfig } from "@monadforge/sdk";
import { MonetizedExecutor, PaymentDetails } from "./monetization";
import { NodeIdentity } from "./manifest";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("Routing");

export class NodeRouter {
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
        logger.info(
          `Loaded ${Object.keys(data).length} peer node manifests from persistent storage.`,
        );
      }
    } catch (err: any) {
      logger.error("Failed to load peer nodes from persistent file", err);
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
      logger.info(
        `Persisted ${this.localRegistry.size} peer node manifests to ${filePath}.`,
      );
    } catch (err: any) {
      logger.error("Failed to persist peer nodes to file", err);
    }
  }

  public static registerAgent(agentId: string, manifest: any): void {
    this.ensureRegistryLoaded();
    manifest.registeredAt = manifest.registeredAt || Date.now();
    this.localRegistry.set(agentId, manifest);
    logger.info(`Registered node '${agentId}' in router database.`);
    this.persistRegistry();
  }

  public static async invokeAgent(
    targetAgentId: string,
    skillName: string,
    params: Record<string, any>,
    paymentDetails?: PaymentDetails,
    context?: any,
  ): Promise<any> {
    this.ensureRegistryLoaded();
    logger.info(
      `Routing request to node '${targetAgentId}' for skill '${skillName}'`,
    );

    if (targetAgentId === "monadforge-node" || targetAgentId === "monadforge") {
      return this.localExecutor.executeSkill(
        skillName,
        params,
        paymentDetails,
        context,
      );
    }

    let remoteAgent = this.localRegistry.get(targetAgentId);
    const isExpired = remoteAgent && remoteAgent.registeredAt && (Date.now() - remoteAgent.registeredAt > 3600000);

    if ((!remoteAgent || isExpired) && process.env.AGENT_REGISTRY_ADDRESS) {
      logger.info(
        `Node '${targetAgentId}' not found locally or cache expired. Querying Registry contract at ${process.env.AGENT_REGISTRY_ADDRESS}`,
      );
      try {
        const config = getConfig();
        const provider = new ethers.JsonRpcProvider(config.MONAD_RPC_URL);
        const registryAbi = [
          "function getAgent(string agentId) external view returns (string name, string endpointUrl, string manifestJson)",
        ];
        const registryContract = new ethers.Contract(
          process.env.AGENT_REGISTRY_ADDRESS,
          registryAbi,
          provider,
        );
        const [name, endpointUrl, manifestJson] =
          await registryContract.getAgent(targetAgentId);

        if (name || endpointUrl || manifestJson) {
          let parsedManifest = {};
          try {
            parsedManifest = JSON.parse(manifestJson);
          } catch {}

          remoteAgent = {
            agentId: targetAgentId,
            name: name || targetAgentId,
            endpointUrl: endpointUrl || "",
            registeredAt: Date.now(),
            ...parsedManifest,
          };
          this.localRegistry.set(targetAgentId, remoteAgent);
          this.persistRegistry();
          logger.info(
            `Dynamically registered peer '${targetAgentId}' from on-chain Registry.`,
          );
        }
      } catch (err: any) {
        logger.error(
          `On-chain Registry query failed for '${targetAgentId}'`,
          err,
        );
      }
    }

    if (!remoteAgent) {
      throw new Error(`Target node '${targetAgentId}' not found in registry.`);
    }

    logger.info(
      `Simulating remote call to node '${targetAgentId}' for skill '${skillName}'`,
    );
    if (
      remoteAgent.pricing?.[skillName] &&
      parseFloat(remoteAgent.pricing[skillName].price) > 0
    ) {
      if (!paymentDetails) {
        throw new Error(
          `Node '${targetAgentId}' requires payment for skill '${skillName}'.`,
        );
      }
    }

    if (remoteAgent.endpointUrl) {
      logger.info(
        `Sending real network request to node '${targetAgentId}' at ${remoteAgent.endpointUrl}`,
      );
      const payloadObj = {
        skillName,
        params,
        paymentDetails,
        timestamp: Date.now().toString(),
      };
      const payloadStr = JSON.stringify(payloadObj);

      const config = getConfig();
      let privateKey = config.DEPLOYER_PRIVATE_KEY;
      if (
        !privateKey ||
        privateKey ===
          "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        privateKey =
          "0x0123456789012345678901234567890123456789012345678901234567890123";
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
            "X-Node-Signature": signature,
            "X-Node-Sender": senderAddress,
          },
          body: payloadStr,
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(
            `HTTP error ${response.status}: ${errBody.error || response.statusText}`,
          );
        }

        const resJson = await response.json();
        return resJson.result;
      } catch (err: any) {
        logger.error(`Failed to invoke remote node at ${url}`, err);
        throw err;
      }
    }

    return {
      status: "success",
      message: `Simulated response from remote node ${targetAgentId} for skill ${skillName}`,
      output: {
        agentId: targetAgentId,
        skill: skillName,
        timestamp: new Date().toISOString(),
        mockData: true,
      },
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
    const nodes: Record<string, any> = {
      "monadforge-node": NodeIdentity.getManifest(),
    };
    for (const [id, manifest] of this.localRegistry.entries()) {
      nodes[id] = manifest;
    }
    return nodes;
  }
}
