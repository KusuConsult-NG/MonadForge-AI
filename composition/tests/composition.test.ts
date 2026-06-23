import { SkillCompositionEngine } from "../src/index";

describe("SkillCompositionEngine Unit Tests", () => {
  let engine: SkillCompositionEngine;

  beforeEach(() => {
    engine = new SkillCompositionEngine();
  });

  it("should compose a DEX workflow with correct steps and dependencies", async () => {
    const plan = await engine.composeSkills("Build a DEX protocol on Monad");
    expect(plan.steps.length).toBe(6);
    expect(plan.steps[0].id).toBe("step-gen-token");
    expect(plan.steps[1].id).toBe("step-gen-amm");
    expect(plan.steps[2].dependencies).toContain("step-gen-token");
    expect(plan.steps[3].dependencies).toContain("step-gen-amm");
    expect(plan.steps[4].dependencies).toContain("step-audit-token");
    expect(plan.steps[5].dependencies).toContain("step-audit-amm");

    const graph = await engine.generateDependencyGraph(plan);
    expect(graph).toContain("graph TD");
    expect(graph).toContain("step-gen-token --> step-audit-token");
  });

  it("should compose an NFT marketplace workflow", async () => {
    const plan = await engine.composeSkills("Create a new NFT Marketplace");
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0].id).toBe("step-gen-nft");
  });

  it("should compose a staking protocol workflow", async () => {
    const plan = await engine.composeSkills("Create a staking protocol");
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0].id).toBe("step-gen-staking");
  });

  it("should compose a default workflow for unknown goals", async () => {
    const plan = await engine.composeSkills("Do something unknown");
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0].id).toBe("step-gen-default");
  });

  it("should execute a composed workflow successfully", async () => {
    const auditSpy = jest
      .spyOn((engine as any).agentSkills.auditEngine, "runAudit")
      .mockResolvedValueOnce({
        riskScore: 0,
        issues: [],
        recommendations: [],
      });

    const plan = await engine.composeSkills("Create a staking protocol");
    const result = await engine.executeWorkflow(plan);
    expect(result.success).toBe(true);
    expect(result.stepResults["step-gen-staking"]).toBeDefined();
    expect(result.stepResults["step-audit-staking"]).toBeDefined();
    expect(result.stepResults["step-deploy-staking"]).toBeDefined();
    expect(result.errors).toBeUndefined();

    auditSpy.mockRestore();
  });

  it("should build a workflow and execute successfully", async () => {
    const auditSpy = jest
      .spyOn((engine as any).agentSkills.auditEngine, "runAudit")
      .mockResolvedValueOnce({
        riskScore: 0,
        issues: [],
        recommendations: [],
      });

    const plan = await engine.composeSkills("Create a staking protocol");
    const result = await engine.buildWorkflow(plan);
    expect(result.success).toBe(true);
    expect(result.stepResults["step-gen-staking"]).toBeDefined();

    auditSpy.mockRestore();
  });

  it("should return failure if any step in workflow execution fails", async () => {
    const plan = await engine.composeSkills("Create a staking protocol");
    // Inject invalid step parameter to trigger route error
    plan.steps[0].params.domain = "invalid-domain";

    const result = await engine.executeWorkflow(plan);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]).toContain("Step step-gen-staking failed");
  });
});
