import {
  AgentIdentity,
  MockPaymentAdapter,
  MonetizedExecutor,
  AgentRouter,
  AgentMarketplace,
  EthersPaymentAdapter,
  calculateDynamicPrice,
} from "../src/index";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { TransactionQueue, DeploymentEngine } from "../../actions/src/index";

process.env.PAYMENT_RECEIVER_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
process.env.DEPLOYER_PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123";
require("@monadforge/sdk").resetConfigForTesting();

jest.mock("@monadforge/sdk", () => {
  const actualSdk = jest.requireActual("@monadforge/sdk");
  return {
    ...actualSdk,
    getConfig: jest.fn().mockImplementation(() => {
      return {
        DEPLOYER_PRIVATE_KEY:
          process.env.TEST_DEPLOYER_PRIVATE_KEY ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        MONAD_RPC_URL: "https://testnet-rpc.monad.xyz",
        MONAD_RPC_URL_FALLBACK: "https://rpc-devnet.monad.xyz",
        NODE_ENV: "test",
      };
    }),
  };
});

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
      expect(manifest.pricing.run_audit).toEqual({
        price: "1.0",
        token: "MON",
      });
    });

    it("should return all skill packages", () => {
      const pkgs = AgentIdentity.getSkillPackages();
      expect(pkgs.length).toBeGreaterThan(0);
      expect(pkgs.some((p) => p.skill === "generate_contract")).toBe(true);
    });

    it("should get a specific skill package", () => {
      const pkg = AgentIdentity.getSkillPackage("run_audit");
      expect(pkg.skill).toBe("run_audit");
      expect(pkg.schema.pricing.price).toBe("1.0");
    });

    it("should throw error if skill package is not found", () => {
      expect(() => AgentIdentity.getSkillPackage("non_existent")).toThrow(
        "Skill package not found",
      );
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
      const res1 = await AgentRouter.invokeAgent(
        "monadforge-ai",
        "search_docs",
        { query: "monad" },
      );
      const res2 = await AgentRouter.invokeAgent("monadforge", "search_docs", {
        query: "monad",
      });
      expect(res1.topMatches).toBeDefined();
      expect(res2.topMatches).toBeDefined();
    });

    it("should reject invocation for unknown remote agent", async () => {
      await expect(
        AgentRouter.invokeAgent("unknown-agent", "search_docs", {
          query: "test",
        }),
      ).rejects.toThrow("Target agent 'unknown-agent' not found in registry.");
    });

    it("should invoke remote registered agent via simulation", async () => {
      const mockManifest = {
        agentId: "remote-agent",
        pricing: { search_docs: { price: "0.0", token: "MON" } },
      };
      AgentRouter.registerAgent("remote-agent", mockManifest);
      const res = await AgentRouter.invokeAgent("remote-agent", "search_docs", {
        query: "test",
      });
      expect(res.status).toBe("success");
      expect(res.output.agentId).toBe("remote-agent");
    });

    it("should reject remote invocation if payment is required but missing", async () => {
      const mockManifest = {
        agentId: "remote-agent",
        pricing: { run_audit: { price: "1.0", token: "MON" } },
      };
      AgentRouter.registerAgent("remote-agent", mockManifest);
      await expect(
        AgentRouter.invokeAgent("remote-agent", "run_audit", {
          code: "contract X {}",
        }),
      ).rejects.toThrow("requires payment");
    });

    it("should write registrations to the file system", () => {
      AgentRouter.clearRegistry();
      const mockPeerManifest = {
        agentId: "temp-persisted-agent",
        name: "Temp Node",
        pricing: {},
      };
      AgentRouter.registerAgent("temp-persisted-agent", mockPeerManifest);

      const peersFilePath = path.resolve(
        process.cwd(),
        ".monadforge",
        "peers.json",
      );
      expect(fs.existsSync(peersFilePath)).toBe(true);
      const content = fs.readFileSync(peersFilePath, "utf-8");
      const data = JSON.parse(content);
      expect(data["temp-persisted-agent"]).toBeDefined();
      expect(data["temp-persisted-agent"].name).toBe("Temp Node");

      AgentRouter.clearRegistry();
    });

    it("should reload registered agents from file system on initialization", () => {
      AgentRouter.clearRegistry();

      const peersFilePath = path.resolve(
        process.cwd(),
        ".monadforge",
        "peers.json",
      );
      const dirPath = path.dirname(peersFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const mockPeerManifest = {
        agentId: "offline-persisted-agent",
        name: "Offline Persisted Node",
        pricing: {},
      };
      fs.writeFileSync(
        peersFilePath,
        JSON.stringify({
          "offline-persisted-agent": mockPeerManifest,
        }),
        "utf-8",
      );

      const registered = AgentRouter.getRegisteredAgents();
      expect(registered["offline-persisted-agent"]).toBeDefined();
      expect(registered["offline-persisted-agent"].name).toBe(
        "Offline Persisted Node",
      );

      AgentRouter.clearRegistry();
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
        status: "success",
      });

      const allHistory = AgentMarketplace.getExecutionHistory();
      expect(allHistory.length).toBe(1);
      expect(allHistory[0].skillName).toBe("search_docs");

      const filtered = AgentMarketplace.getExecutionHistory("non_existent");
      expect(filtered.length).toBe(0);

      const filteredSelf =
        AgentMarketplace.getExecutionHistory("monadforge-ai");
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
      const result = await executor.executeSkill(
        "run_audit",
        { code: "contract X {}" },
        { chargeId, txHash: "0x123456789" },
      );
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
      await expect(
        adapter.verifyPayment("non_existent", "0x123"),
      ).rejects.toThrow("Charge not found");
      await expect(adapter.settleExecution("non_existent")).rejects.toThrow(
        "Charge not found",
      );
    });

    it("should throw error if trying to settle unpaid charge", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      await expect(adapter.settleExecution(chargeId)).rejects.toThrow(
        "Cannot settle unpaid charge",
      );
    });

    it("should reject execution of paid skill without payment details", async () => {
      await expect(
        executor.executeSkill("run_audit", { code: "contract X {}" }),
      ).rejects.toThrow("requires payment");
    });

    it("should reject execution of paid skill if payment verification fails", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      await expect(
        executor.executeSkill(
          "run_audit",
          { code: "contract X {}" },
          { chargeId, txHash: "invalid_hash" },
        ),
      ).rejects.toThrow("Payment verification failed");
    });
  });

  describe("EthersPaymentAdapter", () => {
    let mockProvider: any;
    let adapter: EthersPaymentAdapter;

    beforeEach(() => {
      mockProvider = {
        getTransaction: jest.fn(),
        getTransactionReceipt: jest.fn(),
      };
      adapter = new EthersPaymentAdapter(mockProvider);
    });

    it("should verify native MON payment successfully", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 1,
      });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(true);
      expect(adapter.getChargeStatus(chargeId)).toBe("paid");
    });

    it("should verify ERC-20 payment successfully", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const chargeId = await adapter.createCharge(
        "generate_contract",
        "0.5",
        tokenAddress,
      );

      mockProvider.getTransaction.mockResolvedValue({
        to: tokenAddress,
      });

      const receiverTopic =
        "0x" +
        "0".repeat(24) +
        "742d35Cc6634C0532925a3b844Bc454e4438f44e".toLowerCase();
      const amountData = "0x" + "0".repeat(15) + "de0b6b3a7640000"; // 1 ether in hex, padded

      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: tokenAddress,
            topics: [
              ethers.id("Transfer(address,address,uint256)"),
              "0x" + "0".repeat(64),
              receiverTopic,
            ],
            data: amountData,
          },
        ],
      });

      const result = await adapter.verifyPayment(chargeId, "0x54321");
      expect(result).toBe(true);
      expect(adapter.getChargeStatus(chargeId)).toBe("paid");
    });

    it("should reject payment verification if transaction is not found", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue(null);

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(false);
    });

    it("should reject payment verification if transaction receipt is not found", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      });
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(false);
    });

    it("should reject payment verification if transaction status is failed", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 0 });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(false);
    });

    it("should reject payment verification if recipient does not match receiver", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0xIncorrectRecipientAddress",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(false);
    });

    it("should reject payment verification if native MON value is insufficient", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        value: ethers.parseEther("0.5"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(false);
    });

    it("should reject payment verification if ERC-20 Transfer log recipient is incorrect", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const chargeId = await adapter.createCharge(
        "generate_contract",
        "0.5",
        tokenAddress,
      );

      mockProvider.getTransaction.mockResolvedValue({ to: tokenAddress });
      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: tokenAddress,
            topics: [
              ethers.id("Transfer(address,address,uint256)"),
              "0x" + "0".repeat(64),
              "0x" +
                "0".repeat(24) +
                "0000000000000000000000000000000000000000",
            ],
            data: "0x" + "0".repeat(15) + "de0b6b3a7640000",
          },
        ],
      });

      const result = await adapter.verifyPayment(chargeId, "0x54321");
      expect(result).toBe(false);
    });

    it("should reject payment verification if transaction hash format is invalid", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      const result = await adapter.verifyPayment(chargeId, "invalid-hash");
      expect(result).toBe(false);
    });

    it("should try fallback RPC if primary RPC throws", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockRejectedValue(new Error("RPC Timeout"));

      const connectSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => {
          return {
            getTransaction: jest.fn().mockResolvedValue({
              to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
              value: ethers.parseEther("1.0"),
            }),
            getTransactionReceipt: jest.fn().mockResolvedValue({
              status: 1,
              logs: [],
            }),
          } as any;
        });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(true);
      expect(adapter.getChargeStatus(chargeId)).toBe("paid");

      connectSpy.mockRestore();
    });

    it("should cover fallback RPC path for ERC-20 token", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const chargeId = await adapter.createCharge(
        "generate_contract",
        "0.5",
        tokenAddress,
      );
      mockProvider.getTransaction.mockRejectedValue(new Error("RPC Timeout"));

      const receiverTopic =
        "0x" +
        "0".repeat(24) +
        "742d35Cc6634C0532925a3b844Bc454e4438f44e".toLowerCase();
      const amountData = "0x" + "0".repeat(15) + "de0b6b3a7640000";

      const connectSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => {
          return {
            getTransaction: jest.fn().mockResolvedValue({ to: tokenAddress }),
            getTransactionReceipt: jest.fn().mockResolvedValue({
              status: 1,
              logs: [
                {
                  address: tokenAddress,
                  topics: [
                    ethers.id("Transfer(address,address,uint256)"),
                    "0x" + "0".repeat(64),
                    receiverTopic,
                  ],
                  data: amountData,
                },
              ],
            }),
          } as any;
        });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(true);
      expect(adapter.getChargeStatus(chargeId)).toBe("paid");

      connectSpy.mockRestore();
    });

    it("should instantiate with default provider if not provided", () => {
      const defaultAdapter = new EthersPaymentAdapter();
      expect(defaultAdapter).toBeDefined();
    });

    it("should throw error if charge is not found during verifyPayment", async () => {
      await expect(
        adapter.verifyPayment("non_existent", "0x123"),
      ).rejects.toThrow("Charge not found");
    });

    it("should check PAYMENT_RECEIVER_ADDRESS from process.env", async () => {
      process.env.PAYMENT_RECEIVER_ADDRESS =
        "0x8888888888888888888888888888888888888888";
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x8888888888888888888888888888888888888888",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
      const result = await adapter.verifyPayment(chargeId, "0x123");
      expect(result).toBe(true);
      delete process.env.PAYMENT_RECEIVER_ADDRESS;
    });

    it("should derive receiver address from DEPLOYER_PRIVATE_KEY if valid", async () => {
      process.env.TEST_DEPLOYER_PRIVATE_KEY =
        "0x0123456789012345678901234567890123456789012345678901234567890123";

      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      // Derived address of 0x0123456789012345678901234567890123456789012345678901234567890123 is 0x14791697260E4c9A71f18484C9f997B308e59325
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x14791697260E4c9A71f18484C9f997B308e59325",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
      const result = await adapter.verifyPayment(chargeId, "0x123");
      expect(result).toBe(true);

      delete process.env.TEST_DEPLOYER_PRIVATE_KEY;
    });

    it("should fallback to default address if DEPLOYER_PRIVATE_KEY is invalid", async () => {
      process.env.TEST_DEPLOYER_PRIVATE_KEY = "invalid-key";

      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
      const result = await adapter.verifyPayment(chargeId, "0x123");
      expect(result).toBe(true);

      delete process.env.TEST_DEPLOYER_PRIVATE_KEY;
    });

    it("should return false if fallback RPC verification also fails", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockRejectedValue(new Error("RPC Timeout"));

      const connectSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => {
          return {
            getTransaction: jest
              .fn()
              .mockRejectedValue(new Error("Fallback RPC Timeout")),
          } as any;
        });

      const result = await adapter.verifyPayment(chargeId, "0x12345");
      expect(result).toBe(false);

      connectSpy.mockRestore();
    });

    it("should reject payment verification if ERC-20 transfer log has incorrect token address", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      const chargeId = await adapter.createCharge(
        "generate_contract",
        "0.5",
        tokenAddress,
      );

      mockProvider.getTransaction.mockResolvedValue({ to: tokenAddress });
      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: "0xWrongTokenAddress",
            topics: [
              ethers.id("Transfer(address,address,uint256)"),
              "0x" + "0".repeat(64),
              "0x" +
                "0".repeat(24) +
                "742d35Cc6634C0532925a3b844Bc454e4438f44e",
            ],
            data: "0x" + "0".repeat(15) + "de0b6b3a7640000",
          },
        ],
      });

      const result = await adapter.verifyPayment(chargeId, "0x54321");
      expect(result).toBe(false);
    });

    it("should throw error in settleExecution if charge is not found", async () => {
      await expect(adapter.settleExecution("non_existent")).rejects.toThrow(
        "Charge not found",
      );
    });

    it("should throw error in settleExecution if charge is unpaid", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      await expect(adapter.settleExecution(chargeId)).rejects.toThrow(
        "Cannot settle unpaid charge",
      );
    });

    it("should settle execution correctly", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });

      await adapter.verifyPayment(chargeId, "0x123");
      await adapter.settleExecution(chargeId);
      expect(adapter.getChargeStatus(chargeId)).toBe("settled");
    });

    it("should instantiate and verify using default provider", async () => {
      const defaultAdapter = new EthersPaymentAdapter();
      const chargeId = await defaultAdapter.createCharge(
        "run_audit",
        "1.0",
        "MON",
      );

      const connectSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => {
          return {
            getTransaction: jest.fn().mockResolvedValue({
              to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
              value: ethers.parseEther("1.0"),
            }),
            getTransactionReceipt: jest.fn().mockResolvedValue({ status: 1 }),
          } as any;
        });

      const result = await defaultAdapter.verifyPayment(chargeId, "0x123");
      expect(result).toBe(true);

      connectSpy.mockRestore();
    });

    it("should cancel charges and mark them refunded", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      await adapter.cancelCharge(chargeId);
      expect(adapter.getChargeStatus(chargeId)).toBe("refunded");
    });

    it("should process write operations sequentially via TransactionQueue", async () => {
      const order: number[] = [];
      const p1 = TransactionQueue.enqueue(
        "0x0123456789012345678901234567890123456789012345678901234567890123",
        async () => {
          await new Promise((r) => setTimeout(r, 50));
          order.push(1);
        },
      );
      const p2 = TransactionQueue.enqueue(
        "0x0123456789012345678901234567890123456789012345678901234567890123",
        async () => {
          order.push(2);
        },
      );
      await Promise.all([p1, p2]);
      expect(order).toEqual([1, 2]);
    });

    it("should refund payment if skill execution fails", async () => {
      const errorAdapter = new MockPaymentAdapter();
      const errorExecutor = new MonetizedExecutor(errorAdapter);

      jest
        .spyOn((errorExecutor as any).skills, "route")
        .mockRejectedValue(new Error("Execution Failed"));

      const chargeId = await errorAdapter.createCharge(
        "run_audit",
        "1.0",
        "MON",
      );
      await errorAdapter.verifyPayment(chargeId, "0x1234567890");

      await expect(
        errorExecutor.executeSkill(
          "run_audit",
          { code: "contract X {}" },
          { chargeId, txHash: "0x1234567890" },
        ),
      ).rejects.toThrow("Execution Failed");

      expect(errorAdapter.getChargeStatus(chargeId)).toBe("refunded");
    });

    it("should calculate dynamic prices based on code size and congestion", () => {
      const basePrice = "1.0";

      const price1 = calculateDynamicPrice(
        "run_audit",
        { code: "" },
        basePrice,
      );
      expect(parseFloat(price1)).toBe(1.0);

      const price2 = calculateDynamicPrice(
        "run_audit",
        { code: "a".repeat(5000) },
        basePrice,
      );
      expect(parseFloat(price2)).toBeCloseTo(1.5);

      process.env.GAS_CONGESTION = "high";
      const price3 = calculateDynamicPrice(
        "run_audit",
        { code: "" },
        basePrice,
      );
      expect(parseFloat(price3)).toBeCloseTo(1.5);
      delete process.env.GAS_CONGESTION;
    });

    it("should query agent from on-chain Registry contract fallback", async () => {
      process.env.AGENT_REGISTRY_ADDRESS =
        "0xRegistryAddress0000000000000000000000000";
      AgentRouter.clearRegistry();

      const connectSpy = jest
        .spyOn(ethers, "Contract")
        .mockImplementation(() => {
          return {
            getAgent: jest.fn().mockResolvedValue([
              "On-Chain Agent",
              "",
              JSON.stringify({
                pricing: { search_docs: { price: "0.0", token: "MON" } },
              }),
            ]),
          } as any;
        });

      const registeredBefore = AgentRouter.getRegisteredAgents();
      expect(registeredBefore["on-chain-agent"]).toBeUndefined();

      const res = await AgentRouter.invokeAgent(
        "on-chain-agent",
        "search_docs",
        { query: "test" },
      );
      expect(res.status).toBe("success");

      const registeredAfter = AgentRouter.getRegisteredAgents();
      expect(registeredAfter["on-chain-agent"]).toBeDefined();
      expect(registeredAfter["on-chain-agent"].name).toBe("On-Chain Agent");

      connectSpy.mockRestore();
      delete process.env.AGENT_REGISTRY_ADDRESS;
    });

    it("should attach cryptographic work attestation to skill results", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });

      const testExecutor = new MonetizedExecutor(adapter);
      const result = await testExecutor.executeSkill(
        "run_audit",
        { code: "pragma solidity ^0.8.20; contract Test {}" },
        { chargeId, txHash: "0x123" },
      );

      expect(result.attestation).toBeDefined();
      expect(result.attestation.agentId).toBe("monadforge-ai");
      expect(result.attestation.signature.startsWith("0x")).toBe(true);

      const recovered = ethers.verifyMessage(
        JSON.stringify({
          agentId: result.attestation.agentId,
          skillName: "run_audit",
          timestamp: result.attestation.timestamp,
          outputHash: result.attestation.outputHash,
        }),
        result.attestation.signature,
      );
      expect(recovered.startsWith("0x")).toBe(true);
    });

    it("should throw error in cancelCharge if charge is not found", async () => {
      await expect(adapter.cancelCharge("non_existent")).rejects.toThrow(
        "Charge not found",
      );
    });

    it("should catch and log error if cancelCharge throws inside executeSkill", async () => {
      const errorAdapter = new MockPaymentAdapter();
      const errorExecutor = new MonetizedExecutor(errorAdapter);
      jest
        .spyOn((errorExecutor as any).skills, "route")
        .mockRejectedValue(new Error("Execution Failed"));
      jest
        .spyOn(errorAdapter, "cancelCharge")
        .mockRejectedValue(new Error("Cancel Failed"));

      const chargeId = await errorAdapter.createCharge(
        "run_audit",
        "1.0",
        "MON",
      );
      await errorAdapter.verifyPayment(chargeId, "0x1234567890");

      await expect(
        errorExecutor.executeSkill(
          "run_audit",
          { code: "contract X {}" },
          { chargeId, txHash: "0x1234567890" },
        ),
      ).rejects.toThrow("Execution Failed");
    });

    it("should catch and log error if attestation generation fails", async () => {
      const chargeId = await adapter.createCharge("run_audit", "1.0", "MON");
      mockProvider.getTransaction.mockResolvedValue({
        to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        value: ethers.parseEther("1.0"),
      });
      mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });

      const walletSpy = jest.spyOn(ethers, "Wallet").mockImplementationOnce(() => {
        throw new Error("Wallet Sign Failed");
      });

      try {
        const testExecutor = new MonetizedExecutor(adapter);
        const result = await testExecutor.executeSkill(
          "run_audit",
          { code: "pragma solidity ^0.8.20; contract Test {}" },
          { chargeId, txHash: "0x123" },
        );
        expect(result.attestation).toBeUndefined();
      } finally {
        walletSpy.mockRestore();
      }
    });

    it("should handle error in on-chain Registry fallback gracefully", async () => {
      process.env.AGENT_REGISTRY_ADDRESS = "0xRegistryAddress";
      const mockContract = jest
        .spyOn(ethers, "Contract")
        .mockImplementationOnce(() => {
          throw new Error("Connection failed");
        });

      await expect(
        AgentRouter.invokeAgent("on-chain-agent-fail", "search_docs", {
          query: "test",
        }),
      ).rejects.toThrow("not found in registry");

      mockContract.mockRestore();
      delete process.env.AGENT_REGISTRY_ADDRESS;
    });

    it("should compile AgentVerifier solidity contract successfully", async () => {
      const engine = new DeploymentEngine();
      const contractPath = path.resolve(process.cwd(), "contracts", "AgentVerifier.sol");
      const content = fs.readFileSync(contractPath, "utf-8");
      const compileRes = await engine.compile({
        "contracts/AgentVerifier.sol": content
      });
      expect(compileRes.status).toBe("success");
      expect(compileRes.metadata.success).toBe(true);
      expect(compileRes.metadata.abi).toBeDefined();
    });

    it("should calculate gas deduction and perform on-chain refund transfer", async () => {
      const mockWalletSend = jest.fn().mockResolvedValue({
        hash: "0xRefundTxHash",
        wait: jest.fn().mockResolvedValue({ status: 1 })
      });
      const originalSend = ethers.Wallet.prototype.sendTransaction;
      ethers.Wallet.prototype.sendTransaction = mockWalletSend;

      try {
        const provider = new ethers.JsonRpcProvider("http://localhost:8545");
        jest.spyOn(provider, "getTransaction").mockResolvedValue({
          from: "0xSenderAddress",
          to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
          value: ethers.parseEther("1.0")
        } as any);
        jest.spyOn(provider, "getTransactionReceipt").mockResolvedValue({
          status: 1,
          logs: []
        } as any);
        jest.spyOn(provider, "getFeeData").mockResolvedValue({
          gasPrice: ethers.parseUnits("50", "gwei")
        } as any);

        const refundAdapter = new EthersPaymentAdapter(provider);
        const chargeId = await refundAdapter.createCharge("run_audit", "1.0", "MON");
        const verified = await refundAdapter.verifyPayment(chargeId, "0xRealTransactionHashForRefund");
        expect(verified).toBe(true);
        await refundAdapter.cancelCharge(chargeId);

        expect(mockWalletSend).toHaveBeenCalled();
        const callArgs = mockWalletSend.mock.calls[0][0];
        expect(callArgs.to).toBe("0xSenderAddress");
        const expectedRefund = ethers.parseEther("1.0") - (ethers.parseUnits("50", "gwei") * 21000n);
        expect(callArgs.value).toBe(expectedRefund);
      } finally {
        ethers.Wallet.prototype.sendTransaction = originalSend;
      }
    });

    it("should refresh peer cache from on-chain Registry contract fallback if TTL has expired", async () => {
      process.env.AGENT_REGISTRY_ADDRESS = "0xRegistryAddress0000000000000000000000000";
      AgentRouter.clearRegistry();

      const expiredTimestamp = Date.now() - 3700000;
      const mockPeerManifest = {
        agentId: "ttl-expired-agent",
        name: "Expired Node",
        registeredAt: expiredTimestamp,
        pricing: { "search_docs": { price: "0.0", token: "MON" } }
      };
      AgentRouter.registerAgent("ttl-expired-agent", mockPeerManifest);

      const getAgentSpy = jest.fn().mockResolvedValue([
        "Refreshed On-Chain Agent",
        "",
        JSON.stringify({
          pricing: { "search_docs": { price: "0.0", token: "MON" } }
        })
      ]);

      const connectSpy = jest
        .spyOn(ethers, "Contract")
        .mockImplementation(() => {
          return {
            getAgent: getAgentSpy,
          } as any;
        });

      const res = await AgentRouter.invokeAgent("ttl-expired-agent", "search_docs", { query: "test" });
      expect(res.status).toBe("success");
      expect(getAgentSpy).toHaveBeenCalledWith("ttl-expired-agent");

      const registeredAfter = AgentRouter.getRegisteredAgents();
      expect(registeredAfter["ttl-expired-agent"].name).toBe("Refreshed On-Chain Agent");
      expect(registeredAfter["ttl-expired-agent"].registeredAt).toBeGreaterThan(Date.now() - 5000);

      connectSpy.mockRestore();
      delete process.env.AGENT_REGISTRY_ADDRESS;
    });

    afterAll(() => {
      delete process.env.PAYMENT_RECEIVER_ADDRESS;
      delete process.env.DEPLOYER_PRIVATE_KEY;
      require("@monadforge/sdk").resetConfigForTesting();
    });
  });
});
