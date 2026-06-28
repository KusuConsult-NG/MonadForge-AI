import { createLogger } from "@monadforge/sdk";
import { AgentIdentity } from "./manifest";

const logger = createLogger("Marketplace");

export interface ExecutionRecord {
  executionId: string;
  agentId: string;
  skillName: string;
  timestamp: string;
  durationMs: number;
  status: "success" | "failed";
  pricePaid?: string;
  token?: string;
}

export class AgentMarketplace {
  private static executionHistory: ExecutionRecord[] = [];

  public static getAvailableSkills(): any[] {
    logger.info(
      "Retrieving available skills from Marketplace Capability Registry",
    );
    return AgentIdentity.getSkillPackages();
  }

  public static getPricingManifest(): Record<
    string,
    { price: string; token: string }
  > {
    const manifest = AgentIdentity.getManifest();
    return manifest.pricing || {};
  }

  public static getReputation(): any {
    const manifest = AgentIdentity.getManifest();
    return manifest.reputation || {};
  }

  public static recordExecution(
    record: Omit<ExecutionRecord, "executionId" | "timestamp">,
  ): void {
    const executionId = `exec_${Math.random().toString(36).substring(2, 15)}`;
    const timestamp = new Date().toISOString();
    this.executionHistory.push({
      executionId,
      timestamp,
      ...record,
    });
    logger.info(
      `Recorded execution ${executionId} on Marketplace for skill ${record.skillName}`,
    );
  }

  public static getExecutionHistory(filterAgentId?: string): ExecutionRecord[] {
    if (filterAgentId) {
      return this.executionHistory.filter(
        (rec) => rec.agentId === filterAgentId,
      );
    }
    return this.executionHistory;
  }

  public static clearHistory(): void {
    this.executionHistory = [];
  }
}
