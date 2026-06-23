import { AgentSkills } from "../src/index";

describe("AgentSkills Unit Tests", () => {
  let agentSkills: AgentSkills;

  beforeEach(() => {
    agentSkills = new AgentSkills();
  });

  it("should execute Skill 001: Create ERC20 Token", async () => {
    const project = await agentSkills.createERC20Token(
      "ForgeToken",
      "FORGE",
      "1000000",
    );
    expect(project.contracts["contracts/ForgeToken.sol"]).toBeDefined();
    expect(project.contracts["contracts/ForgeToken.sol"]).toContain(
      "contract ForgeToken is ERC20",
    );
    expect(project.tests["test/ForgeToken.test.ts"]).toBeDefined();
    expect(project.deploymentScripts["scripts/deploy.ts"]).toBeDefined();
  });

  it("should execute Skill 002: Create NFT Collection", async () => {
    const project = await agentSkills.createNFTCollection("ForgeNFT", "FNFT");
    expect(project.contracts["contracts/ForgeNFT.sol"]).toBeDefined();
    expect(project.contracts["contracts/ForgeNFT.sol"]).toContain(
      "contract ForgeNFT is ERC721",
    );
    expect(project.tests["test/ForgeNFT.test.ts"]).toBeDefined();
    expect(project.deploymentScripts["scripts/deploy.ts"]).toBeDefined();
  });

  it("should execute Skill 003: Create Staking Contract", async () => {
    const project = await agentSkills.createStakingContract("0x123", "0x456");
    expect(project.contracts["contracts/SimpleStaking.sol"]).toBeDefined();
    expect(project.contracts["contracts/SimpleStaking.sol"]).toContain(
      "contract SimpleStaking",
    );
  });

  it("should execute Skill 004: Deploy Application successfully", async () => {
    const projectFiles = {
      "contracts/ForgeToken.sol":
        "pragma solidity ^0.8.20; contract ForgeToken {}",
    };
    const result = await agentSkills.deployApplication(
      "proj-123",
      projectFiles,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );

    expect(result.contractAddress).toBe(
      "0xDePloYedContractAddResS0000000000000000123",
    );
    expect(result.transactionHash).toBe(
      "0xMockTxHashDePloY0000000000000000000000000000000000000000000456",
    );
    expect(result.verificationStatus).toContain(
      "verified on Monad Testnet block explorer",
    );
  });

  it("should fail deployment if compilation fails", async () => {
    const projectFiles = {
      "contracts/Bad.sol": "invalid code",
    };

    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
    process.env.NODE_ENV = "production";
    process.env.DEPLOYER_PRIVATE_KEY =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    const { resetConfigForTesting } = require("@monadforge/sdk");
    resetConfigForTesting();

    await expect(
      agentSkills.deployApplication(
        "proj-123",
        projectFiles,
        "0x1234567890123456789012345678901234567890123456789012345678901234",
      ),
    ).rejects.toThrow(/Compilation failed:/);

    process.env.NODE_ENV = originalEnv;
    if (originalKey) {
      process.env.DEPLOYER_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.DEPLOYER_PRIVATE_KEY;
    }
    resetConfigForTesting();
  });

  it("should fail deployment if deployment result status is failed", async () => {
    const projectFiles = {
      "contracts/ForgeToken.sol":
        "pragma solidity ^0.8.20; contract ForgeToken {}",
    };

    const deploymentEngineSpy = jest
      .spyOn(
        require("@monadforge/actions").DeploymentEngine.prototype,
        "deployToTestnet",
      )
      .mockResolvedValueOnce({
        status: "failure",
        action: "deploy",
        metadata: {
          contractAddress: "",
          transactionHash: "",
          gasUsed: "0",
          status: "failed",
        },
      });

    await expect(
      agentSkills.deployApplication("proj-123", projectFiles, "0x00"),
    ).rejects.toThrow("Deployment to Monad Testnet failed");

    deploymentEngineSpy.mockRestore();
  });

  describe("Routing Tests", () => {
    it("should route generate_contract skill", async () => {
      const project = await agentSkills.route("generate_contract", {
        name: "Token",
        symbol: "TKN",
        domain: "erc20",
      });
      expect(project.contracts["contracts/Token.sol"]).toBeDefined();
    });

    it("should route run_audit skill and pass", async () => {
      const report = await agentSkills.route("run_audit", {
        code: "pragma solidity ^0.8.0; contract Simple {}",
      });
      expect(report.issues).toBeDefined();
    });

    it("should route run_audit skill and throw if critical issues exist", async () => {
      const badCode = `
        contract Hack {
          address owner;
          function setOwner() public {
            owner = tx.origin;
          }
        }
      `;
      jest.spyOn(agentSkills["auditEngine"], "runAudit").mockResolvedValueOnce({
        riskScore: 90,
        issues: [
          {
            id: "1",
            severity: "Critical",
            category: "Access Control",
            title: "Critical",
            description: "desc",
            recommendation: "rec",
          },
        ],
        recommendations: [],
      });

      await expect(
        agentSkills.route("run_audit", { code: badCode }),
      ).rejects.toThrow(/Audit failed/);
    });

    it("should route deploy_contract skill", async () => {
      const res = await agentSkills.route("deploy_contract", {});
      expect(res.status).toBe("success");
    });

    it("should handle verification failure in deploy_contract skill routing gracefully", async () => {
      const verifySpy = jest
        .spyOn((agentSkills as any).actionLayer.deploymentEngine, "verifyDeployment")
        .mockRejectedValueOnce(new Error("Verification endpoint offline"));

      const res = await agentSkills.route("deploy_contract", {});
      expect(res.status).toBe("success");
      expect(res.metadata.verificationStatus).toBeUndefined();
      verifySpy.mockRestore();
    });

    it("should throw compiler error on deploy_contract if compilation fails", async () => {
      const compileSpy = jest
        .spyOn((agentSkills as any).actionLayer.deploymentEngine, "compile")
        .mockResolvedValueOnce({
          status: "failure",
          action: "compile",
          metadata: {
            success: false,
            abi: [],
            bytecode: "",
            errors: ["Mock compiler error"],
          },
        });
      await expect(agentSkills.route("deploy_contract", {})).rejects.toThrow(
        /Compilation failed during deploy step: Mock compiler error/,
      );
      compileSpy.mockRestore();
    });

    it("should route verify_contract skill", async () => {
      const res = await agentSkills.route("verify_contract", {
        contractAddress: "0x123",
      });
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
    });

    it("should route verify_contract skill with filePath", async () => {
      const fs = require("fs");
      const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValueOnce(true);
      const readSpy = jest
        .spyOn(fs, "readFileSync")
        .mockReturnValueOnce("contract MockVerify {}");

      const res = await agentSkills.route("verify_contract", {
        contractAddress: "0x123",
        filePath: "contracts/Token.sol",
      });
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);

      existsSpy.mockRestore();
      readSpy.mockRestore();
    });

    it("should route search_docs skill", async () => {
      const res = await agentSkills.route("search_docs", {
        query: "consensus",
      });
      expect(res.topMatches).toBeDefined();
    });

    it("should route execute_action skill for mint, stake, swap, and transfer", async () => {
      const resMint = await agentSkills.route("execute_action", {
        action: "mint",
        contractAddress: "0x123",
      });
      expect(resMint.status).toBe("success");
      expect(resMint.metadata.success).toBe(true);

      const resStake = await agentSkills.route("execute_action", {
        action: "stake",
        contractAddress: "0x123",
      });
      expect(resStake.status).toBe("success");
      expect(resStake.metadata.success).toBe(true);

      const resSwap = await agentSkills.route("execute_action", {
        action: "swap",
        contractAddress: "0x123",
      });
      expect(resSwap.status).toBe("success");
      expect(resSwap.metadata.success).toBe(true);

      const resTransfer = await agentSkills.route("execute_action", {
        action: "transfer",
        to: "0xabc",
      });
      expect(resTransfer.status).toBe("success");
      expect(resTransfer.metadata.success).toBe(true);

      // Call actions without arguments to hit the fallbacks
      const fallbackMint = await agentSkills.route("execute_action", {
        action: "mint",
      });
      expect(fallbackMint.status).toBe("success");
      expect(fallbackMint.metadata.success).toBe(true);

      const fallbackStake = await agentSkills.route("execute_action", {
        action: "stake",
      });
      expect(fallbackStake.status).toBe("success");
      expect(fallbackStake.metadata.success).toBe(true);

      const fallbackSwap = await agentSkills.route("execute_action", {
        action: "swap",
      });
      expect(fallbackSwap.status).toBe("success");
      expect(fallbackSwap.metadata.success).toBe(true);

      const fallbackTransfer = await agentSkills.route("execute_action", {
        action: "transfer",
      });
      expect(fallbackTransfer.status).toBe("success");
      expect(fallbackTransfer.metadata.success).toBe(true);
    });

    it("should throw error for unsupported action in execute_action", async () => {
      await expect(
        agentSkills.route("execute_action", { action: "unsupported" }),
      ).rejects.toThrow("Unsupported action type: unsupported");
    });

    it("should throw error for unknown skill", async () => {
      await expect(agentSkills.route("unknown_skill", {})).rejects.toThrow(
        "Unknown skill name: unknown_skill",
      );
    });

    it("should route run_audit with valid filePath", async () => {
      const fs = require("fs");
      const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValueOnce(true);
      const readSpy = jest
        .spyOn(fs, "readFileSync")
        .mockReturnValueOnce("contract MockAudit {}");

      const report = await agentSkills.route("run_audit", {
        filePath: "contracts/Mock.sol",
      });
      expect(report.issues).toBeDefined();

      existsSpy.mockRestore();
      readSpy.mockRestore();
    });

    it("should throw error on run_audit with invalid filePath", async () => {
      const fs = require("fs");
      const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValueOnce(false);

      await expect(
        agentSkills.route("run_audit", {
          filePath: "contracts/NonExistent.sol",
        }),
      ).rejects.toThrow("File not found for audit: contracts/NonExistent.sol");

      existsSpy.mockRestore();
    });

    it("should route run_audit with contracts directory fallback", async () => {
      const fs = require("fs");
      const existsSpy = jest
        .spyOn(fs, "existsSync")
        .mockImplementation((p: any) => {
          if (typeof p === "string" && p.endsWith("contracts")) return true;
          return false;
        });
      const readdirSpy = jest
        .spyOn(fs, "readdirSync")
        .mockReturnValueOnce(["Mock.sol"] as any);
      const readSpy = jest
        .spyOn(fs, "readFileSync")
        .mockReturnValueOnce("contract MockAudit {}");

      const report = await agentSkills.route("run_audit", {});
      expect(report.issues).toBeDefined();

      existsSpy.mockRestore();
      readdirSpy.mockRestore();
      readSpy.mockRestore();
    });

    it("should route run_audit with no files found fallback", async () => {
      const fs = require("fs");
      const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValueOnce(false);

      const report = await agentSkills.route("run_audit", {});
      expect(report.issues).toBeDefined();

      existsSpy.mockRestore();
    });

    it("should route deploy_contract with no contracts found fallback", async () => {
      const fs = require("fs");
      const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValueOnce(false);

      const res = await agentSkills.route("deploy_contract", {});
      expect(res.status).toBe("success");

      existsSpy.mockRestore();
    });

    it("should route deploy_contract when contracts directory exists but is empty", async () => {
      const fs = require("fs");
      const existsSpy = jest
        .spyOn(fs, "existsSync")
        .mockImplementation((p: any) => {
          if (typeof p === "string" && p.endsWith("contracts")) return true;
          return false;
        });
      const readdirSpy = jest.spyOn(fs, "readdirSync").mockReturnValueOnce([]);

      const res = await agentSkills.route("deploy_contract", {});
      expect(res.status).toBe("success");

      existsSpy.mockRestore();
      readdirSpy.mockRestore();
    });

    it("should fall back to defaults when generate_contract has empty parameters", async () => {
      const project = await agentSkills.route("generate_contract", {});
      expect(project.contracts["contracts/Token.sol"]).toBeDefined();
    });

    it("should use default mock private key if not configured in context or environment", async () => {
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      delete process.env.DEPLOYER_PRIVATE_KEY;

      const res = await agentSkills.route("deploy_contract", {});
      expect(res.status).toBe("success");

      const resAction = await agentSkills.route("execute_action", {
        action: "mint",
      });
      expect(resAction.status).toBe("success");
      expect(resAction.metadata.success).toBe(true);

      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      }
    });

    it("should handle deployApplication with empty files list", async () => {
      await expect(
        agentSkills.deployApplication("empty-proj", {}, "0x00"),
      ).rejects.toThrow();
    });
  });
});
