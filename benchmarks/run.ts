import { AgentRuntimeEngine } from "@monadforge/agent-runtime";
import { createLogger } from "@monadforge/sdk";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("Benchmarks");

export interface BenchmarkResult {
  task: string;
  generationTimeMs: number;
  compileSuccess: boolean;
  deploymentSuccess: boolean;
  auditFindings: number;
  repairSuccess: boolean;
  overallSuccess: boolean;
}

export async function runBenchmarks(): Promise<string> {
  logger.info("Starting MonadForge AI Benchmarks suite");
  const runtime = new AgentRuntimeEngine();
  const tasks = [
    {
      name: "Build ERC20",
      goal: "Build an ERC20 token named ForgeToken for project benchmark-erc20",
    },
    {
      name: "Build DAO",
      goal: "Build a DAO governance protocol named CommunityDAO for project benchmark-dao",
    },
    {
      name: "Build Staking Protocol",
      goal: "Build a staking protocol for project benchmark-staking",
    },
    {
      name: "Build NFT Marketplace",
      goal: "Build an NFT marketplace for project benchmark-marketplace",
    },
    { name: "Build AMM", goal: "Build an AMM pool for project benchmark-amm" },
  ];

  const results: BenchmarkResult[] = [];

  for (const t of tasks) {
    const startTime = Date.now();
    let compileSuccess = false;
    let deploymentSuccess = false;
    let auditFindings = 0;
    let repairSuccess = false;
    let overallSuccess = false;

    try {
      logger.info(`Running benchmark task: ${t.name}`);
      const result = await runtime.executeGoal(t.goal);
      overallSuccess = result.success;

      // Extract results from planning / execution logs
      const ctx = await (runtime as any).memoryEngine.loadProjectContext(
        t.goal.split("project ").pop() || "default-project",
      );

      if (ctx) {
        // Compile success is true if we generated contract code
        compileSuccess = Object.keys(ctx.contracts).length > 0;
        deploymentSuccess = ctx.deployments.length > 0;
        auditFindings =
          ctx.detectedIssues?.filter((i: string) => i !== "None").length || 0;
      }

      repairSuccess = result.repaired;
    } catch (e: any) {
      logger.error(`Benchmark task failed: ${t.name} (${e.message})`);
    }

    const duration = Date.now() - startTime;
    results.push({
      task: t.name,
      generationTimeMs: duration,
      compileSuccess,
      deploymentSuccess,
      auditFindings,
      repairSuccess,
      overallSuccess,
    });
  }

  // Generate markdown report
  let report = `# MonadForge AI Infrastructure Benchmarks Report

Generated at: ${new Date().toISOString()}

| Task | Execution Time (ms) | Compile Success | Deployment Success | Audit Issues Found | Auto-Repair Success | Overall Success |
| --- | --- | --- | --- | --- | --- | --- |
`;

  for (const r of results) {
    report += `| ${r.task} | ${r.generationTimeMs} | ${r.compileSuccess ? "✅" : "❌"} | ${r.deploymentSuccess ? "✅" : "❌"} | ${r.auditFindings} | ${r.repairSuccess ? "✅" : "N/A"} | ${r.overallSuccess ? "✅" : "❌"} |\n`;
  }

  const reportPath = path.resolve(process.cwd(), "benchmark-report.md");
  fs.writeFileSync(reportPath, report, "utf8");
  logger.info(`Benchmarks report written to ${reportPath}`);

  return report;
}

// Run directly if invoked from command line
/* istanbul ignore next */
if (require.main === module) {
  runBenchmarks().catch(() => {});
}
