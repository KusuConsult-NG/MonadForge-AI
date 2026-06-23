import { AgentRuntimeEngine } from "../src/index";
import * as fs from "fs";
import * as path from "path";

describe("AgentRuntimeEngine Unit Tests", () => {
  let runtime: AgentRuntimeEngine;
  const testProjectId = "agent-project";

  beforeEach(() => {
    runtime = new AgentRuntimeEngine();
    // Clean up test file if it exists
    const filePath = path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      `${testProjectId}.json`,
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    jest
      .spyOn(
        (runtime as any).compositionEngine.agentSkills.auditEngine,
        "runAudit",
      )
      .mockResolvedValue({
        riskScore: 0,
        issues: [],
        recommendations: [],
      });
  });

  afterAll(() => {
    const filePath = path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      `${testProjectId}.json`,
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it("should run a goal autonomously, compose skills, and save memory state", async () => {
    const result = await runtime.executeGoal(
      "Build a staking protocol on Monad for project agent-project",
    );
    expect(result.success).toBe(true);
    expect(result.compositionPlan).toBeDefined();
    expect(result.mermaidGraph).toContain("graph TD");
    expect(result.memorySaved).toBe(true);
    expect(result.deployments.length).toBeGreaterThan(0);
  });

  it("should continue a project loading previous context and updating decisions", async () => {
    // Initial run
    await runtime.executeGoal(
      "Build a staking protocol on Monad for project agent-project",
    );

    // Continue run
    const result = await runtime.continueProject(
      testProjectId,
      "Add new tokens",
    );
    expect(result.success).toBe(true);
    expect(result.deployments.length).toBeGreaterThan(0);
  });

  it("should trigger self-healing repair on compilation failures and succeed after retry", async () => {
    // Force compilation failure by mocking executeWorkflow to fail first
    const mockPlan = await runtime["compositionEngine"].composeSkills(
      "Build a DEX protocol on Monad for project agent-project",
    );

    // Spy on executeWorkflow to return a parser/compilation error on first call
    let callCount = 0;
    const workflowSpy = jest
      .spyOn(runtime["compositionEngine"], "executeWorkflow")
      .mockImplementation(async (plan: any) => {
        callCount++;
        if (callCount === 1) {
          return {
            success: false,
            stepResults: {},
            errors: [
              "Compilation failed: ParserError: Expected ';' but got end of source",
            ],
          };
        }
        // Succeed on retry
        return {
          success: true,
          stepResults: {
            "step-deploy-default": {
              contractAddress: "0xAddressRepaired",
              transactionHash: "0xTxHashRepaired",
              status: "success",
            },
          },
        };
      });

    const result = await runtime.executeGoal(
      "Build a DEX protocol on Monad for project agent-project",
    );
    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.repairLogs.length).toBe(1);
    expect(result.repairLogs[0].finalOutcome).toBe("success");
    expect(result.deployments[0].contractAddress).toBe("0xAddressRepaired");

    workflowSpy.mockRestore();
  });

  it("should trigger self-healing repair on audit failures and succeed after retry", async () => {
    let callCount = 0;
    const workflowSpy = jest
      .spyOn(runtime["compositionEngine"], "executeWorkflow")
      .mockImplementation(async (plan: any) => {
        callCount++;
        if (callCount === 1) {
          return {
            success: false,
            stepResults: {},
            errors: [
              "Audit failed: ACCESS-001: Unprotected Sensitive Function",
            ],
          };
        }
        return {
          success: true,
          stepResults: {
            "step-deploy-default": {
              contractAddress: "0xAddressRepaired",
              transactionHash: "0xTxHashRepaired",
              status: "success",
            },
          },
        };
      });

    const result = await runtime.executeGoal(
      "Build a DEX protocol on Monad for project agent-project",
    );
    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);

    workflowSpy.mockRestore();
  });

  it("should trigger self-healing repair on deployment errors", async () => {
    let callCount = 0;
    const workflowSpy = jest
      .spyOn(runtime["compositionEngine"], "executeWorkflow")
      .mockImplementation(async (plan: any) => {
        callCount++;
        if (callCount === 1) {
          return {
            success: false,
            stepResults: {},
            errors: ["Deployment failed: 0 MON balance"],
          };
        }
        return {
          success: true,
          stepResults: {},
        };
      });

    const result = await runtime.executeGoal(
      "Build a DEX protocol on Monad for project agent-project",
    );
    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);

    workflowSpy.mockRestore();
  });

  it("should handle unrepairable generic errors gracefully", async () => {
    const workflowSpy = jest
      .spyOn(runtime["compositionEngine"], "executeWorkflow")
      .mockResolvedValue({
        success: false,
        stepResults: {},
        errors: ["Random unexpected workflow failure"],
      });

    const result = await runtime.executeGoal(
      "Build a DEX protocol on Monad for project agent-project",
    );
    expect(result.success).toBe(false);
    expect(result.repaired).toBe(false);
    expect(result.message).toContain("Random unexpected workflow failure");

    workflowSpy.mockRestore();
  });

  it("should handle failed workflow with empty error list and unknown step key", async () => {
    const composeSpy = jest
      .spyOn(runtime["compositionEngine"], "composeSkills")
      .mockResolvedValueOnce({
        projectId: "agent-project",
        goal: "Build DEX",
        steps: [],
      } as any);
    const workflowSpy = jest
      .spyOn(runtime["compositionEngine"], "executeWorkflow")
      .mockResolvedValueOnce({
        success: false,
        stepResults: {},
        errors: [],
      });

    const result = await runtime.executeGoal(
      "Build a DEX protocol on Monad for project agent-project",
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe("Task execution failed: ");

    composeSpy.mockRestore();
    workflowSpy.mockRestore();
  });

  it("should fall back to default project if no project ID is in the prompt", async () => {
    const result = await runtime.executeGoal("Build a staking protocol on Monad");
    expect(result.success).toBe(true);

    // Clean up default-project
    const filePath = path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      "default-project.json",
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it("should handle successful deployments without transaction hashes", async () => {
    const composeSpy = jest
      .spyOn(runtime["compositionEngine"], "composeSkills")
      .mockResolvedValueOnce({
        projectId: "agent-project",
        goal: "Build DEX",
        steps: [
          { id: "step-deploy-1", skill: "deploy_contract", dependencies: [], params: {} }
        ],
      } as any);
    const workflowSpy = jest
      .spyOn(runtime["compositionEngine"], "executeWorkflow")
      .mockResolvedValueOnce({
        success: true,
        stepResults: {
          "step-deploy-1": {
            contractAddress: "0xAddressMocked",
            // transactionHash is omitted to trigger the fallback branch
            status: "success",
          },
        },
      });

    const result = await runtime.executeGoal("Build a DEX protocol on Monad for project agent-project");
    expect(result.success).toBe(true);
    expect(result.deployments.length).toBe(1);
    expect(result.deployments[0].transactionHash).toBe("0x");

    composeSpy.mockRestore();
    workflowSpy.mockRestore();
  });
});
