import { PlanningEngine } from "../src/index";

describe("PlanningEngine Unit Tests", () => {
  let engine: PlanningEngine;

  beforeEach(() => {
    engine = new PlanningEngine();
  });

  it("should plan generation flow (generate and audit)", async () => {
    const intent = {
      type: "generate",
      domain: "erc20",
      params: { name: "Token", symbol: "TKN", supply: "100" },
      constraints: [],
    };
    const plan = await engine.createPlan(intent);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].skillName).toBe("generate_contract");
    expect(plan.steps[1].skillName).toBe("run_audit");
  });

  it("should plan deployment flow with mandatory pre-deploy audit", async () => {
    const intent = {
      type: "deploy",
      domain: "unknown",
      params: { projectId: "my-project" },
      constraints: [],
    };
    const plan = await engine.createPlan(intent);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].skillName).toBe("run_audit");
    expect(plan.steps[1].skillName).toBe("deploy_contract");
  });

  it("should plan audit flow", async () => {
    const intent = {
      type: "audit",
      domain: "unknown",
      params: { filePath: "contracts/Token.sol" },
      constraints: [],
    };
    const plan = await engine.createPlan(intent);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].skillName).toBe("run_audit");
  });

  it("should plan verify flow", async () => {
    const intent = {
      type: "verify",
      domain: "unknown",
      params: { contractAddress: "0x123" },
      constraints: [],
    };
    const plan = await engine.createPlan(intent);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].skillName).toBe("verify_contract");
  });

  it("should plan action execution flow", async () => {
    const intent = {
      type: "action",
      domain: "erc20",
      params: { action: "mint", amount: "100", to: "0xabc" },
      constraints: [],
    };
    const plan = await engine.createPlan(intent);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].skillName).toBe("execute_action");
  });

  it("should plan docs search flow", async () => {
    const intent = {
      type: "docs",
      domain: "unknown",
      params: { query: "Monad consensus" },
      constraints: [],
    };
    const plan = await engine.createPlan(intent as any);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].skillName).toBe("search_docs");
  });
});
