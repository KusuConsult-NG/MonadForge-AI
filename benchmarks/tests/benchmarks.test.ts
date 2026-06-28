import { runBenchmarks } from "../run";
import { NodeRuntimeEngine } from "@monadforge/node-runtime";
import * as fs from "fs";
import * as path from "path";

describe("MonadForge Benchmarks Unit Tests", () => {
  const reportPath = path.resolve(process.cwd(), "benchmark-report.md");

  beforeEach(() => {
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  });

  it("should run benchmark tasks, record metrics, and produce markdown report", async () => {
    // Mock the runtime executeGoal to avoid real long runs during test
    const executeGoalSpy = jest
      .spyOn(NodeRuntimeEngine.prototype, "executeGoal")
      .mockResolvedValue({
        success: true,
        intent: {
          type: "generate",
          domain: "erc20",
          params: { projectId: "test" },
          constraints: [],
        },
        repaired: false,
        repairLogs: [],
        deployments: [],
        memorySaved: true,
        message: "Mock task execution succeeded",
      });

    // Mock loadProjectContext inside MemoryEngine
    const { MemoryEngine } = require("@monadforge/memory");
    const loadContextSpy = jest
      .spyOn(MemoryEngine.prototype, "loadProjectContext")
      .mockResolvedValue({
        projectId: "test",
        contracts: { "contracts/Token.sol": "code" },
        deployments: [
          {
            contractName: "Token",
            contractAddress: "0x123",
            transactionHash: "0x00",
            network: "monad-testnet",
            timestamp: "2026-06-22",
          },
        ],
        planningHistory: [],
        decisions: [],
        detectedIssues: ["None"],
        auditResults: [],
        skillHistory: [],
      });

    const report = await runBenchmarks();
    expect(report).toContain("MonadForge Infrastructure Benchmarks Report");
    expect(report).toContain("Build ERC20");
    expect(report).toContain("Build AMM");
    expect(fs.existsSync(reportPath)).toBe(true);

    executeGoalSpy.mockRestore();
    loadContextSpy.mockRestore();
  });
});
