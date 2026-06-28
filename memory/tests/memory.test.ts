import { MemoryEngine, ProjectContext } from "../src/index";
import * as fs from "fs";
import * as path from "path";

describe("MemoryEngine Unit Tests", () => {
  let engine: MemoryEngine;
  const testProjectId = "test-project-123";

  beforeEach(() => {
    engine = new MemoryEngine();
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

  it("should return null if project context does not exist", async () => {
    const context = await engine.loadProjectContext(testProjectId);
    expect(context).toBeNull();
  });

  it("should save, load, and update project context successfully", async () => {
    const mockContext: ProjectContext = {
      projectId: testProjectId,
      contracts: {
        "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}",
      },
      deployments: [
        {
          contractName: "Token",
          contractAddress: "0x1234567890123456789012345678901234567890",
          transactionHash: "0xabc",
          network: "monad-testnet",
          timestamp: new Date().toISOString(),
        },
      ],
      planningHistory: [{ goal: "Build Token" }],
      decisions: ["Use standard ERC20 template"],
      detectedIssues: ["None"],
      auditResults: [],
      skillHistory: [],
    };

    await engine.saveProjectContext(testProjectId, mockContext);

    const loaded = await engine.loadProjectContext(testProjectId);
    expect(loaded).toBeDefined();
    expect(loaded?.projectId).toBe(testProjectId);
    expect(loaded?.decisions).toContain("Use standard ERC20 template");

    // Test updateProjectContext on existing context
    await engine.updateProjectContext(testProjectId, {
      decisions: ["Add more tokens"],
      contracts: { "contracts/Token2.sol": "contract Token2 {}" },
      deployments: [
        {
          contractName: "Token2",
          contractAddress: "0x2234567890123456789012345678901234567890",
          transactionHash: "0xdef",
          network: "monad-testnet",
          timestamp: new Date().toISOString(),
        },
      ],
      planningHistory: [{ goal: "Build Token 2" }],
      detectedIssues: ["Low gas"],
      auditResults: [{ riskScore: 10 }],
      skillHistory: [{ routedTo: "deploy_contract" }],
    });

    const updated = await engine.loadProjectContext(testProjectId);
    expect(updated?.decisions).toContain("Add more tokens");
    expect(updated?.contracts["contracts/Token2.sol"]).toBe(
      "contract Token2 {}",
    );

    // Test helper APIs
    const history = await engine.getDeploymentHistory(testProjectId);
    expect(history.length).toBe(2);
    expect(history[0].contractName).toBe("Token");
    expect(history[1].contractName).toBe("Token2");

    const projectHistory = await engine.getProjectHistory(testProjectId);
    expect(projectHistory.length).toBeGreaterThan(0);
    expect(projectHistory[0].type).toBe("plan");

    const issues = await engine.getKnownIssues(testProjectId);
    expect(issues).toContain("None");

    const graph = await engine.getProjectGraph(testProjectId);
    expect(graph.nodes.length).toBe(4); // 2 contracts + 2 deployment nodes
    expect(graph.edges.length).toBe(2); // 2 edges linking them
    expect(graph.edges[0].label).toBe("deployed_as");
  });

  it("should initialize empty context if updating non-existing project", async () => {
    await engine.updateProjectContext(testProjectId, {
      decisions: ["Initial Decision"],
    });
    const loaded = await engine.loadProjectContext(testProjectId);
    expect(loaded).toBeDefined();
    expect(loaded?.decisions).toContain("Initial Decision");
  });

  it("should cover all fallback update paths in updateProjectContext", async () => {
    // 1. Non-existing project update with minimal fields
    await engine.updateProjectContext(testProjectId + "-fallback", {});
    const loadedNew = await engine.loadProjectContext(
      testProjectId + "-fallback",
    );
    expect(loadedNew?.contracts).toEqual({});
    expect(loadedNew?.decisions).toEqual([]);

    // 2. Existing project update with no new fields (falls back to current)
    await engine.updateProjectContext(testProjectId + "-fallback", {});
    const loadedExist = await engine.loadProjectContext(
      testProjectId + "-fallback",
    );
    expect(loadedExist?.contracts).toEqual({});

    // Clean up
    const filePath = path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      `${testProjectId}-fallback.json`,
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it("should return null and log warning if context file is corrupted JSON", async () => {
    const filePath = path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      `${testProjectId}.json`,
    );
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, "corrupted { json data", "utf8");

    const loaded = await engine.loadProjectContext(testProjectId);
    expect(loaded).toBeNull();
  });

  it("should return empty history if project does not exist", async () => {
    const history = await engine.getProjectHistory("non-existent");
    expect(history).toEqual([]);
  });

  it("should call mkdirSync if directory does not exist", async () => {
    const fsLib = require("fs");
    const existSpy = jest.spyOn(fsLib, "existsSync").mockReturnValue(false);
    const mkdirSpy = jest
      .spyOn(fsLib.promises, "mkdir")
      .mockImplementation(() => Promise.resolve(undefined));
    const writeSpy = jest
      .spyOn(fsLib.promises, "writeFile")
      .mockImplementation(() => Promise.resolve());

    const mockContext: ProjectContext = {
      projectId: "temp-project",
      contracts: {},
      deployments: [],
      planningHistory: [],
      decisions: [],
      detectedIssues: [],
      auditResults: [],
      skillHistory: [],
    };

    await engine.saveProjectContext("temp-project", mockContext);
    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();

    existSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("should cover fallback branches in getDeploymentHistory, getKnownIssues, and getProjectHistory", async () => {
    // 1. Call helpers on non-existent project to cover the falsy ctx branches
    const depHistory = await engine.getDeploymentHistory("non-existent");
    expect(depHistory).toEqual([]);

    const knownIssues = await engine.getKnownIssues("non-existent");
    expect(knownIssues).toEqual([]);

    // 2. Save a context where a plan has no goal to cover the plan.goal fallback branch
    const mockContext: ProjectContext = {
      projectId: "plan-no-goal-project",
      contracts: {},
      deployments: [],
      planningHistory: [{ goal: null }],
      decisions: [],
      detectedIssues: [],
      auditResults: [],
      skillHistory: [],
    };
    await engine.saveProjectContext("plan-no-goal-project", mockContext);

    const history = await engine.getProjectHistory("plan-no-goal-project");
    expect(history.length).toBe(1);
    expect(history[0].detail).toBe("Plan 1");

    // Clean up
    const filePath = path.resolve(
      process.cwd(),
      ".monadforge",
      "memory",
      "plan-no-goal-project.json",
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it("should validate and save execution traces", async () => {
    const validTrace = {
      traceId: "tr_test_123",
      projectId: "test-project-123",
      timestamp: new Date().toISOString(),
      intent: { type: "generate", domain: "erc20", params: {} },
      plan: { steps: [] },
      stepsExecuted: [],
      repairs: [],
      deployments: [],
      finalStatus: "success",
    };

    // Should succeed
    await expect(
      engine.saveExecutionTrace("test-project-123", validTrace),
    ).resolves.not.toThrow();

    // Verify file exists
    const traceDir = path.resolve(process.cwd(), ".monadforge", "traces");
    const files = fs.readdirSync(traceDir);
    const traceFile = files.find((f) => f.includes("test-project-123"));
    expect(traceFile).toBeDefined();

    // Clean up trace file
    if (traceFile) {
      fs.unlinkSync(path.join(traceDir, traceFile));
    }

    // Invalid trace (missing required fields) should throw error
    const invalidTrace = {
      traceId: "tr_test_123",
      projectId: "test-project-123",
      timestamp: new Date().toISOString(),
    };
    await expect(
      engine.saveExecutionTrace("test-project-123", invalidTrace),
    ).rejects.toThrow();
  });

  it("should rotate trace files if trace count exceeds 100", async () => {
    const fsLib = require("fs");
    const mockFiles = Array.from({ length: 102 }, (_, i) => `trace_2026-06-28-09-00-00_${i}_rotation-proj.json`);
    const readdirSpy = jest.spyOn(fsLib.promises, "readdir").mockResolvedValue(mockFiles as any);
    const statSpy = jest.spyOn(fsLib.promises, "stat").mockResolvedValue({ mtimeMs: 100 } as any);
    const unlinkSpy = jest.spyOn(fsLib.promises, "unlink").mockResolvedValue(undefined as any);
    const writeSpy = jest.spyOn(fsLib.promises, "writeFile").mockResolvedValue(undefined as any);

    const mockTrace = {
      traceId: "tr_test_rot",
      projectId: "rotation-proj",
      timestamp: new Date().toISOString(),
      intent: { type: "generate", domain: "erc20", params: {} },
      plan: { steps: [] },
      stepsExecuted: [],
      repairs: [],
      deployments: [],
      finalStatus: "success",
    };

    await engine.saveExecutionTrace("rotation-proj", mockTrace);

    expect(readdirSpy).toHaveBeenCalled();
    expect(unlinkSpy).toHaveBeenCalledTimes(2);

    readdirSpy.mockRestore();
    statSpy.mockRestore();
    unlinkSpy.mockRestore();
    writeSpy.mockRestore();
  });
});
