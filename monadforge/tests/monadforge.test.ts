import { monadforge } from "../src/index";
import * as fs from "fs";

// Mock fs keeping actual functionality for other methods
jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs");
  return {
    ...actualFs,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

let throwGetConfig = false;
jest.mock("@monadforge/sdk", () => {
  const actualSdk = jest.requireActual("@monadforge/sdk");
  return {
    ...actualSdk,
    getConfig: jest.fn().mockImplementation(() => {
      if (throwGetConfig) {
        return null; // Will trigger TypeError in getPrivateKey() but won't crash isMockEnv() due to short-circuiting in test env
      }
      return {
        DEPLOYER_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000000",
        MONAD_RPC_URL: "https://testnet-rpc.monad.xyz",
        LOG_LEVEL: "INFO",
        NODE_ENV: "test",
      };
    }),
  };
});

describe("MonadForge AI Wrapper exports tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    throwGetConfig = false;
  });

  it("should expose the 5 conceptual namespaces", () => {
    expect(monadforge.intent).toBeDefined();
    expect(monadforge.plan).toBeDefined();
    expect(monadforge.engine).toBeDefined();
    expect(monadforge.actions).toBeDefined();
    expect(monadforge.tools).toBeDefined();
  });

  it("should parse and validate intent", async () => {
    const intent = await monadforge.intent.parseIntent("create erc20 token named Forge");
    expect(intent.type).toBe("generate");
    expect(intent.domain).toBe("erc20");
    const isValid = await monadforge.intent.validateIntent(intent);
    expect(isValid).toBe(true);

    // Test invalid intent
    const isInvalid = await monadforge.intent.validateIntent({
      type: "docs",
      domain: "unknown",
      params: {},
      constraints: [],
    });
    expect(isInvalid).toBe(false);
  });

  it("should create and optimize plan", async () => {
    const intent = await monadforge.intent.parseIntent("create erc20 token named Forge");
    const plan = await monadforge.plan.createPlan(intent);
    expect(plan.steps).toBeDefined();

    const optimized = await monadforge.plan.optimizePlan(plan);
    expect(optimized).toBe(plan);
  });

  it("should execute runs via the engine", async () => {
    const result = await monadforge.engine.run({ goal: "create token", context: {} });
    expect(result.success).toBeDefined();

    const contResult = await monadforge.engine.continue({ projectId: "test-project", prompt: "add features" });
    expect(contResult.success).toBeDefined();
  });

  it("should perform actions", async () => {
    const deployRes = await monadforge.actions.deploy({
      status: "success",
      action: "compile",
      metadata: { success: true, abi: [], bytecode: "0x" }
    }, "local");
    expect(deployRes.metadata.contractAddress).toBeDefined();

    const callRes = await monadforge.actions.call("0x123", "balanceOf(address)", ["0x456"]);
    expect(callRes.status).toBe("success");
    expect(callRes.metadata.success).toBe(true);

    const mintRes = await monadforge.actions.mint("0x123", "0x456", "1000");
    expect(mintRes.status).toBe("success");
    expect(mintRes.metadata.success).toBe(true);

    const stakeRes = await monadforge.actions.stake("0x123", "100");
    expect(stakeRes.status).toBe("success");
    expect(stakeRes.metadata.success).toBe(true);
  });

  it("should perform flow creation, execution, and verification actions", async () => {
    const flowObj = await monadforge.actions.flow.createFlow({
      amount: "10.5",
      recipient: "0x1234567890123456789012345678901234567890",
      description: "API access flow",
    });
    expect(flowObj.flowId).toBeDefined();
    expect(flowObj.amount).toBe("10.5");
    expect(flowObj.recipient).toBe("0x1234567890123456789012345678901234567890");
    expect(flowObj.challenge).toContain("Flow Execution Required");
    expect(flowObj.description).toBe("API access flow");

    // Test fallbacks
    const fallbackFlow = await monadforge.actions.flow.createFlow({
      amount: "10.5",
      recipient: "0x1234567890123456789012345678901234567890",
    });
    expect(fallbackFlow.description).toBe("");
    expect(fallbackFlow.tokenAddress).toBe("native");

    // Test flow with ERC-20 tokenAddress generates EIP-681 URL
    const erc20Flow = await monadforge.actions.flow.createFlow({
      amount: "1000000000000000000",
      recipient: "0x1234567890123456789012345678901234567890",
      tokenAddress: "0xTokenAddress00000000000000000000000000001",
      description: "ERC-20 payment flow",
    });
    expect(erc20Flow.paymentUrl).toContain("0xTokenAddress00000000000000000000000000001");
    expect(erc20Flow.tokenAddress).toBe("0xTokenAddress00000000000000000000000000001");

    // Test executeFlow in mock/zero-key mode
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const execution = await monadforge.actions.flow.executeFlow(
      flowObj.flowId,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      flowObj.recipient,
      flowObj.amount,
      undefined,
    );
    process.env.NODE_ENV = originalEnv;
    expect(execution.flowId).toBe(flowObj.flowId);
    expect(execution.transactionHash).toBeDefined();
    expect(execution.status).toBe("success");

    // Test executeFlow with tokenAddress in mock mode
    const erc20Execution = await monadforge.actions.flow.executeFlow(
      erc20Flow.flowId,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      erc20Flow.recipient,
      erc20Flow.amount,
      erc20Flow.tokenAddress,
    );
    expect(erc20Execution.status).toBe("success");

    // verifyFlow — valid in test env
    const verify = await monadforge.actions.flow.verifyFlow(
      execution.transactionHash,
      "10.5",
      "0x1234567890123456789012345678901234567890",
    );
    expect(verify).toBe(true);

    // verifyFlow — bad txHash (no 0x prefix)
    const verifyBadHash = await monadforge.actions.flow.verifyFlow(
      "notahash",
      "10.5",
      "0x1234567890123456789012345678901234567890",
    );
    expect(verifyBadHash).toBe(false);

    // verifyFlow — zero amount
    const verifyZeroAmount = await monadforge.actions.flow.verifyFlow(
      execution.transactionHash,
      "0",
      "0x1234567890123456789012345678901234567890",
    );
    expect(verifyZeroAmount).toBe(false);

    // verifyFlow — recipient not 0x
    const verifyBadRecipient = await monadforge.actions.flow.verifyFlow(
      execution.transactionHash,
      "10.5",
      "alice.eth",
    );
    expect(verifyBadRecipient).toBe(false);
  });


  it("should fall back safely if getConfig throws in actions", async () => {
    throwGetConfig = true;
    const deployRes = await monadforge.actions.deploy({
      status: "success",
      action: "compile",
      metadata: { success: true, abi: [], bytecode: "0x" }
    }, "local");
    expect(deployRes.metadata.contractAddress).toBeDefined();
  });

  it("should deploy upgradeable contract in mock mode via actions", async () => {
    const deployRes = await monadforge.actions.deployUpgradeable({
      status: "success",
      action: "compile",
      metadata: { success: true, abi: [], bytecode: "0x6060" }
    }, ["arg1"], "initialize");
    expect(deployRes.status).toBe("success");
    expect(deployRes.metadata.proxyAddress).toBeDefined();
    expect(deployRes.metadata.implementationAddress).toBeDefined();
  });

  it("should support automatic verification in deploy and deployUpgradeable actions, and support explicit verification", async () => {
    const deployRes = await monadforge.actions.deploy({
      status: "success",
      action: "compile",
      metadata: {
        success: true,
        abi: [],
        bytecode: "0x",
        sources: {
          "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}"
        }
      }
    }, "local");
    expect(deployRes.metadata.contractAddress).toBeDefined();
    expect(deployRes.metadata.verificationStatus).toBe("success");
    expect(deployRes.metadata.verificationMessage).toContain("verified");

    const upgradeRes = await monadforge.actions.deployUpgradeable({
      status: "success",
      action: "compile",
      metadata: {
        success: true,
        abi: [],
        bytecode: "0x6060",
        sources: {
          "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}"
        }
      }
    }, ["arg1"], "initialize");
    expect(upgradeRes.status).toBe("success");
    expect(upgradeRes.metadata.implementationVerificationStatus).toBe("success");
    expect(upgradeRes.metadata.implementationVerificationMessage).toContain("verified");

    const verifyRes = await monadforge.actions.verify(
      "0x123",
      "pragma solidity ^0.8.20; contract Token {}",
      { contractName: "Token" }
    );
    expect(verifyRes.status).toBe("success");
    expect(verifyRes.metadata.success).toBe(true);
    expect(verifyRes.metadata.message).toContain("verified");
  });

  it("should perform tools operations", async () => {
    const proj = await monadforge.tools.createProject({ name: "my-project" });
    expect(proj.name).toBe("my-project");

    const projEmpty = await monadforge.tools.createProject({} as any);
    expect(projEmpty.name).toBe("monad-project");

    const auditRes = await monadforge.tools.audit("contract Token {}");
    expect(auditRes.riskScore).toBeDefined();

    const repairRes = await monadforge.tools.repair("contract Token {}", ["error"]);
    expect(repairRes.success).toBeDefined();

    const composeRes = await monadforge.tools.compose("Build DEX");
    expect(composeRes.steps).toBeDefined();

    const reviewRes = await monadforge.tools.review({ "Token.sol": "contract Token {}" });
    expect(reviewRes).toBeDefined();
  });

  it("should perform agent operations", async () => {
    expect(monadforge.agent).toBeDefined();
    
    const manifest = monadforge.agent.getManifest();
    expect(manifest.agentId).toBe("monadforge-ai");

    const pkgs = monadforge.agent.getSkillPackages();
    expect(pkgs.length).toBeGreaterThan(0);

    const pricing = monadforge.agent.getPricingManifest();
    expect(pricing.run_audit).toBeDefined();

    const reputation = monadforge.agent.getReputation();
    expect(reputation.score).toBeDefined();

    monadforge.agent.registerAgent("other-agent", { agentId: "other-agent", pricing: { "search_docs": { price: "0.0", token: "MON" } } });
    
    const invokeRes = await monadforge.agent.invokeAgent("other-agent", "search_docs", { query: "test" });
    expect(invokeRes.status).toBe("success");

    monadforge.agent.recordExecution({
      agentId: "monadforge-ai",
      skillName: "search_docs",
      durationMs: 100,
      status: "success"
    });

    const history = monadforge.agent.getExecutionHistory("monadforge-ai");
    expect(history.length).toBeGreaterThan(0);

    const executor = monadforge.agent.createExecutor();
    expect(executor).toBeDefined();

    const adapter = monadforge.agent.createMockPaymentAdapter();
    expect(adapter).toBeDefined();
  });
});
