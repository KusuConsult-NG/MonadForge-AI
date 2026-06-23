import { AgentIdentity, MockPaymentAdapter, MonetizedExecutor, AgentRouter, AgentMarketplace } from "../src/index";

describe("Agent Package Unit Tests", () => {
  beforeEach(() => {
    AgentRouter.clearRegistry();
    AgentMarketplace.clearHistory();
  });

  describe("AgentIdentity", () => {
    it("should return a valid default manifest", () => {
      const manifest = AgentIdentity.getManifest();
      expect(manifest.agentId).toBe("monadforge-ai");
      expect(manifest.name).toBe("MonadForge AI Agent");
      expect(manifest.skills).toContain("generate_contract");
      expect(manifest.pricing.run_audit).toEqual({ price: "1.0", token: "MON" });
    });

    it("should return all skill packages", () => {
      const pkgs = AgentIdentity.getSkillPackages();
      expect(pkgs.length).toBeGreaterThan(0);
      expect(pkgs.some(p => p.skill === "generate_contract")).toBe(true);
    });

    it("should get a specific skill package", () => {
      const pkg = AgentIdentity.getSkillPackage("run_audit");
      expect(pkg.skill).toBe("run_audit");
      expect(pkg.schema.pricing.price).toBe("1.0");
    });

    it("should throw error if skill package is not found", () => {
      expect(() => AgentIdentity.getSkillPackage("non_existent")).toThrow("Skill package not found");
    });
  });

  describe("AgentRouter", () => {
    it("should register an agent and list it via getRegisteredAgents", () => {
      const mockManifest = { agentId: "test-agent", pricing: {} };
      AgentRouter.registerAgent("test-agent", mockManifest);
      const agents = AgentRouter.getRegisteredAgents();
      expect(agents["test-agent"]).toBe(mockManifest);
      expect(agents["monadforge-ai"]).toBeDefined();
    });

    it("should clear the registry", () => {
      AgentRouter.registerAgent("test-agent", { agentId: "test-agent" });
      AgentRouter.clearRegistry();
      const agents = AgentRouter.getRegisteredAgents();
      expect(agents["test-agent"]).toBeUndefined();
      expect(agents["monadforge-ai"]).toBeDefined();
    });

    it("should invoke local agent monadforge-ai or monadforge", async () => {
      const res1 = await AgentRouter.invokeAgent("monadforge-ai", "search_docs", { query: "monad" });
      const res2 = await AgentRouter.invokeAgent("monadforge", "search_docs", { query: "monad" });
      expect(res1.topMatches).toBeDefined();
      expect(res2.topMatches).toBeDefined();
    });

    it("should reject invocation for unknown remote agent", async () => {
      await expect(
        AgentRouter.invokeAgent("unknown-agent", "search_docs", { query: "test" })
      ).rejects.toThrow("Target agent 'unknown-agent' not found in registry.");
    });

    it("should invoke remote registered agent via simulation", async () => {
      const mockManifest = {
        agentId: "remote-agent",
        pricing: { "search_docs": { price: "0.0", token: "MON" } }
      };
      AgentRouter.registerAgent("remote-agent", mockManifest);
      const res = await AgentRouter.invokeAgent("remote-agent", "search_docs", { query: "test" });
      expect(res.status).toBe("success");
      expect(res.output.agentId).toBe("remote-agent");
    });

    it("should reject remote invocation if payment is required but missing", async () => {
      const mockManifest = {
        agentId: "remote-agent",
        pricing: { "run_audit": { price: "1.0", token: "MON" } }
      };
      AgentRouter.registerAgent("remote-agent", mockManifest);
      await expect(
        AgentRouter.invokeAgent("remote-agent", "run_audit", { code: "contract X {}" })
      ).rejects.toThrow("requires payment");
    });
  });

  describe("AgentMarketplace", () => {
    it("should return pricing manifest, available skills and reputation", () => {
      const pricing = AgentMarketplace.getPricingManifest();
      expect(pricing.run_audit).toEqual({ price: "1.0", token: "MON" });

      const reputation = AgentMarketplace.getReputation();
      expect(reputation.score).toBe(98);

      const skills = AgentMarketplace.getAvailableSkills();
      expect(skills.length).toBeGreaterThan(0);
    });

    it("should record and filter execution history", () => {
      AgentMarketplace.recordExecution({
        agentId: "monadforge-ai",
        skillName: "search_docs",
        durationMs: 150,
        status: "success"
      });

      const allHistory = AgentMarketplace.getExecutionHistory();
      expect(allHistory.length).toBe(1);
      expect(allHistory[0].skillName).toBe("search_docs");

      const filtered = AgentMarketplace.getExecutionHistory("non_existent");
      expect(filtered.length).toBe(0);

      const filteredSelf = AgentMarketplace.getExecutionHistory("monadforge-ai");
      expect(filteredSelf.length).toBe(1);
    });
  });

  describe("Monetization & MonetizedExecutor", () => {
    let adapter: MockPaymentAdapter;
    let executor: MonetizedExecutor;

    beforeEach(() => {
      adapter = new MockPaymentAdapter();
      executor = new MonetizedExecutor(adapter);
    });

    it("should perform full payment and execution flow for paid skill", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      expect(chargeId).toBeDefined();
      expect(adapter.getChargeStatus(chargeId)).toBe("pending");

      // Verify payment with valid hash
      const verified = await adapter.verifyPayment(chargeId, "0x123456789");
      expect(verified).toBe(true);
      expect(adapter.getChargeStatus(chargeId)).toBe("paid");

      // Execute skill
      const result = await executor.executeSkill("run_audit", { code: "contract X {}" }, { chargeId, txHash: "0x123456789" });
      expect(result.issues).toBeDefined();
      expect(adapter.getChargeStatus(chargeId)).toBe("settled");
    });

    it("should reject payment verification if transaction hash is invalid", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      const verified = await adapter.verifyPayment(chargeId, "invalid_hash");
      expect(verified).toBe(false);
      expect(adapter.getChargeStatus(chargeId)).toBe("pending");
    });

    it("should throw error if charge is not found during verify or settle", async () => {
      await expect(adapter.verifyPayment("non_existent", "0x123")).rejects.toThrow("Charge not found");
      await expect(adapter.settleExecution("non_existent")).rejects.toThrow("Charge not found");
    });

    it("should throw error if trying to settle unpaid charge", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      await expect(adapter.settleExecution(chargeId)).rejects.toThrow("Cannot settle unpaid charge");
    });

    it("should reject execution of paid skill without payment details", async () => {
      await expect(
        executor.executeSkill("run_audit", { code: "contract X {}" })
      ).rejects.toThrow("requires payment");
    });

    it("should reject execution of paid skill if payment verification fails", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      await expect(
        executor.executeSkill("run_audit", { code: "contract X {}" }, { chargeId, txHash: "invalid_hash" })
      ).rejects.toThrow("Payment verification failed");
    });
  });
});
