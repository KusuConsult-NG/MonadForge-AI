import { createLogger, MemorySchema, ExecutionTraceSchema } from "@monadforge/sdk";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("MemoryEngine");

export interface DeploymentRecord {
  contractName: string;
  contractAddress: string;
  transactionHash: string;
  network: string;
  timestamp: string;
}

export interface ProjectGraph {
  nodes: { id: string; label: string; type: string }[];
  edges: { from: string; to: string; label: string }[];
}

export interface ProjectContext {
  projectId: string;
  contracts: Record<string, string>;
  deployments: DeploymentRecord[];
  planningHistory: any[];
  decisions: string[];
  detectedIssues: string[];
  auditResults: any[];
  skillHistory: any[];
}

export class MemoryEngine {
  private getStoragePath(projectId: string): string {
    return path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      `${projectId}.json`,
    );
  }

  public async loadProjectContext(
    projectId: string,
  ): Promise<ProjectContext | null> {
    logger.info(`Loading project context for ${projectId}`, {
      operation: "loadProjectContext",
    });
    const filePath = this.getStoragePath(projectId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data) as ProjectContext;
    } catch (e: any) {
      logger.error(`Failed to parse project context: ${e.message}`);
      return null;
    }
  }

  public async saveProjectContext(
    projectId: string,
    context: ProjectContext,
  ): Promise<void> {
    logger.info(`Saving project context for ${projectId}`, {
      operation: "saveProjectContext",
    });
    MemorySchema.parse(context);
    const filePath = this.getStoragePath(projectId);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(context, null, 2), "utf8");
  }

  public async saveExecutionTrace(
    projectId: string,
    trace: any,
  ): Promise<void> {
    logger.info(`Saving execution trace for ${projectId}`, {
      operation: "saveExecutionTrace",
    });
    ExecutionTraceSchema.parse(trace);

    const traceDir = path.resolve(process.cwd(), ".monadforge", "traces");
    if (!fs.existsSync(traceDir)) {
      fs.mkdirSync(traceDir, { recursive: true });
    }
    const tracePath = path.join(
      traceDir,
      `trace_${trace.timestamp.replace(/[:.]/g, "-")}_${projectId}.json`,
    );
    fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), "utf8");
    logger.info(`Execution trace written to ${tracePath}`);
  }

  public async updateProjectContext(
    projectId: string,
    updates: Partial<ProjectContext>,
  ): Promise<void> {
    logger.info(`Updating project context for ${projectId}`, {
      operation: "updateProjectContext",
    });
    const current = await this.loadProjectContext(projectId);
    if (current) {
      const updated: ProjectContext = {
        ...current,
        ...updates,
        contracts: updates.contracts
          ? { ...current.contracts, ...updates.contracts }
          : current.contracts,
        deployments: updates.deployments
          ? [...current.deployments, ...updates.deployments]
          : current.deployments,
        planningHistory: updates.planningHistory
          ? [...current.planningHistory, ...updates.planningHistory]
          : current.planningHistory,
        decisions: updates.decisions
          ? [...current.decisions, ...updates.decisions]
          : current.decisions,
        detectedIssues: updates.detectedIssues
          ? [...current.detectedIssues, ...updates.detectedIssues]
          : current.detectedIssues,
        auditResults: updates.auditResults
          ? [...current.auditResults, ...updates.auditResults]
          : current.auditResults,
        skillHistory: updates.skillHistory
          ? [...current.skillHistory, ...updates.skillHistory]
          : current.skillHistory,
      };
      await this.saveProjectContext(projectId, updated);
    } else {
      const newContext: ProjectContext = {
        projectId,
        contracts: updates.contracts || {},
        deployments: updates.deployments || [],
        planningHistory: updates.planningHistory || [],
        decisions: updates.decisions || [],
        detectedIssues: updates.detectedIssues || [],
        auditResults: updates.auditResults || [],
        skillHistory: updates.skillHistory || [],
      };
      await this.saveProjectContext(projectId, newContext);
    }
  }

  public async getProjectHistory(projectId: string): Promise<any[]> {
    logger.info(`Getting project history for ${projectId}`, {
      operation: "getProjectHistory",
    });
    const ctx = await this.loadProjectContext(projectId);
    if (!ctx) return [];

    // Combine planningHistory, decisions, and deployments into a sorted history log
    const history: any[] = [];
    ctx.planningHistory.forEach((plan, i) => {
      history.push({
        type: "plan",
        detail: plan.goal || `Plan ${i + 1}`,
        timestamp: new Date().toISOString(),
      });
    });
    ctx.decisions.forEach((dec) => {
      history.push({
        type: "decision",
        detail: dec,
        timestamp: new Date().toISOString(),
      });
    });
    ctx.deployments.forEach((dep) => {
      history.push({
        type: "deployment",
        detail: `${dep.contractName} deployed to ${dep.network}`,
        timestamp: dep.timestamp,
      });
    });
    return history;
  }

  public async getDeploymentHistory(
    projectId: string,
  ): Promise<DeploymentRecord[]> {
    const ctx = await this.loadProjectContext(projectId);
    return ctx ? ctx.deployments : [];
  }

  public async getProjectGraph(projectId: string): Promise<ProjectGraph> {
    logger.info(`Generating project graph for ${projectId}`, {
      operation: "getProjectGraph",
    });
    const ctx = await this.loadProjectContext(projectId);
    const nodes: ProjectGraph["nodes"] = [];
    const edges: ProjectGraph["edges"] = [];

    if (ctx) {
      // Add contract nodes
      for (const file of Object.keys(ctx.contracts)) {
        const basename = path.basename(file);
        nodes.push({ id: file, label: basename, type: "contract" });
      }

      // Add deployment nodes and link to contracts
      for (const d of ctx.deployments) {
        const deployId = `deploy-${d.contractAddress}`;
        nodes.push({
          id: deployId,
          label: `${d.contractName} @ ${d.contractAddress.substring(0, 8)}`,
          type: "deployment",
        });

        // Find matching contract file path
        const matchingFile = Object.keys(ctx.contracts).find((f) =>
          f.endsWith(`${d.contractName}.sol`),
        );
        if (matchingFile) {
          edges.push({
            from: matchingFile,
            to: deployId,
            label: "deployed_as",
          });
        }
      }
    }

    return { nodes, edges };
  }

  public async getKnownIssues(projectId: string): Promise<string[]> {
    const ctx = await this.loadProjectContext(projectId);
    return ctx ? ctx.detectedIssues : [];
  }
}
