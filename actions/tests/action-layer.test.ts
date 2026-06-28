import { DeploymentEngine, WalletEngine, ActionLayer } from "../src/index";
import { ethers } from "ethers";

describe("DeploymentEngine Unit Tests", () => {
  let engine: DeploymentEngine;

  beforeEach(() => {
    engine = new DeploymentEngine();
  });

  it("should compile valid Solidity code", async () => {
    const files = {
      "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}",
    };
    const res = await engine.compile(files);
    expect(res.status).toBe("success");
    expect(res.metadata.success).toBe(true);
    expect(res.metadata.abi).toBeDefined();
    expect(res.metadata.bytecode).toBeDefined();
  });

  it("should fail compilation for invalid format in mock mode if forced", async () => {
    // Force non-mock environment checking
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
    process.env.NODE_ENV = "production";
    process.env.DEPLOYER_PRIVATE_KEY =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    const { resetConfigForTesting } = require("@monadforge/sdk");
    resetConfigForTesting();

    const files = {
      "contracts/Token.sol": "invalid code",
    };
    const res = await engine.compile(files);
    expect(res.status).toBe("failure");
    expect(res.metadata.success).toBe(false);
    expect(res.metadata.errors).toBeDefined();

    process.env.NODE_ENV = originalEnv;
    if (originalKey) {
      process.env.DEPLOYER_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.DEPLOYER_PRIVATE_KEY;
    }
    resetConfigForTesting();
  });

  it("should deploy compiled contract to testnet", async () => {
    const files = {
      "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}",
    };
    const compileResult = await engine.compile(files);
    const deployResult = await engine.deployToTestnet(compileResult, "0x000");
    expect(deployResult.status).toBe("success");
    expect(deployResult.metadata.contractAddress).toBeDefined();
    expect(deployResult.metadata.transactionHash).toBeDefined();
  });

  it("should reject deployment if compilation failed", async () => {
    const badCompile: any = {
      status: "failure",
      action: "compile",
      metadata: { success: false, abi: [], bytecode: "" },
    };
    await expect(engine.deployToTestnet(badCompile, "0x000")).rejects.toThrow(
      "Cannot deploy",
    );
  });

  it("should verify deployment successfully", async () => {
    const res = await engine.verifyDeployment("0x123", "pragma solidity");
    expect(res.status).toBe("success");
    expect(res.metadata.success).toBe(true);
    expect(res.metadata.message).toContain("verified on Monad Testnet");
  });

  it("should support rollback operation", async () => {
    await expect(engine.rollbackDeployment("0x123")).resolves.not.toThrow();
  });

  it("should deploy to testnet in non-mock mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
    process.env.NODE_ENV = "production";
    process.env.DEPLOYER_PRIVATE_KEY =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    const { resetConfigForTesting } = require("@monadforge/sdk");
    resetConfigForTesting();

    const mockTx = {
      hash: "0xRealTxHash123",
      wait: jest.fn().mockResolvedValue({ gasUsed: BigInt(150000) }),
    };
    const mockContract = {
      waitForDeployment: jest.fn().mockResolvedValue({}),
      getAddress: jest.fn().mockResolvedValue("0xRealContract123"),
      deploymentTransaction: jest.fn().mockReturnValue(mockTx),
    };

    const mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(1),
      getBalance: jest.fn().mockResolvedValue(100000000000000000000n),
    };
    const providerSpy = jest
      .spyOn(ethers, "JsonRpcProvider")
      .mockImplementation(() => mockProvider as any);
    const walletSpy = jest
      .spyOn(ethers, "Wallet")
      .mockImplementation(() => ({ address: "0xAddress" }) as any);
    const factorySpy = jest
      .spyOn(ethers, "ContractFactory")
      .mockImplementation(() => {
        return {
          deploy: jest.fn().mockResolvedValue(mockContract),
        } as any;
      });

    const compileResult: any = {
      status: "success",
      action: "compile",
      metadata: { success: true, abi: [], bytecode: "0x6060" },
    };
    const deployResult = await engine.deployToTestnet(
      compileResult,
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );

    expect(deployResult.status).toBe("success");
    expect(deployResult.metadata.contractAddress).toBe("0xRealContract123");
    expect(deployResult.metadata.transactionHash).toBe("0xRealTxHash123");

    providerSpy.mockRestore();
    walletSpy.mockRestore();
    factorySpy.mockRestore();

    process.env.NODE_ENV = originalEnv;
    if (originalKey) {
      process.env.DEPLOYER_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.DEPLOYER_PRIVATE_KEY;
    }
    resetConfigForTesting();
  });

  it("should handle deploy failure in non-mock mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
    process.env.NODE_ENV = "production";
    process.env.DEPLOYER_PRIVATE_KEY =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    const { resetConfigForTesting } = require("@monadforge/sdk");
    resetConfigForTesting();

    const mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(1),
      getBalance: jest.fn().mockResolvedValue(100000000000000000000n),
    };
    const providerSpy = jest
      .spyOn(ethers, "JsonRpcProvider")
      .mockImplementation(() => mockProvider as any);
    const walletSpy = jest
      .spyOn(ethers, "Wallet")
      .mockImplementation(() => ({ address: "0xAddress" }) as any);
    const factorySpy = jest
      .spyOn(ethers, "ContractFactory")
      .mockImplementation(() => {
        return {
          deploy: jest.fn().mockRejectedValue(new Error("Out of Gas")),
        } as any;
      });

    const compileResult: any = {
      status: "success",
      action: "compile",
      metadata: { success: true, abi: [], bytecode: "0x6060" },
    };
    const deployResult = await engine.deployToTestnet(
      compileResult,
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );

    expect(deployResult.status).toBe("failure");
    expect(deployResult.metadata.contractAddress).toBe("");

    providerSpy.mockRestore();
    walletSpy.mockRestore();
    factorySpy.mockRestore();

    process.env.NODE_ENV = originalEnv;
    if (originalKey) {
      process.env.DEPLOYER_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.DEPLOYER_PRIVATE_KEY;
    }
    resetConfigForTesting();
  });

  it("should handle deploy without transaction hash in non-mock mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
    process.env.NODE_ENV = "production";
    process.env.DEPLOYER_PRIVATE_KEY =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    const { resetConfigForTesting } = require("@monadforge/sdk");
    resetConfigForTesting();

    const mockContract = {
      waitForDeployment: jest.fn().mockResolvedValue({}),
      getAddress: jest.fn().mockResolvedValue("0xRealContract123"),
      deploymentTransaction: jest.fn().mockReturnValue(null),
    };

    const mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(1),
      getBalance: jest.fn().mockResolvedValue(100000000000000000000n),
    };
    const providerSpy = jest
      .spyOn(ethers, "JsonRpcProvider")
      .mockImplementation(() => mockProvider as any);
    const walletSpy = jest
      .spyOn(ethers, "Wallet")
      .mockImplementation(() => ({ address: "0xAddress" }) as any);
    const factorySpy = jest
      .spyOn(ethers, "ContractFactory")
      .mockImplementation(() => {
        return {
          deploy: jest.fn().mockResolvedValue(mockContract),
        } as any;
      });

    const compileResult: any = {
      status: "success",
      action: "compile",
      metadata: { success: true, abi: [], bytecode: "0x6060" },
    };
    const deployResult = await engine.deployToTestnet(
      compileResult,
      "0x1234567890123456789012345678901234567890123456789012345678901234",
    );

    expect(deployResult.status).toBe("success");
    expect(deployResult.metadata.transactionHash).toBe("");

    providerSpy.mockRestore();
    walletSpy.mockRestore();
    factorySpy.mockRestore();

    process.env.NODE_ENV = originalEnv;
    if (originalKey) {
      process.env.DEPLOYER_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.DEPLOYER_PRIVATE_KEY;
    }
    resetConfigForTesting();
  });

  describe("Solidity Compiler Edge Cases", () => {
    it("should fail compilation if no source files are provided", async () => {
      const res = await engine.compile({});
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.errors).toContain(
        "No source files provided for compilation",
      );
    });

    it("should fail compilation for invalid mock contract structure in mock mode", async () => {
      const res = await engine.compile({
        "contracts/Bad.sol": "random string with no special words",
      });
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.errors).toContain(
        "Compilation failed: invalid mock contract structure",
      );
    });

    it("should compile contracts with local imports successfully", async () => {
      const files = {
        "contracts/Token.sol":
          'pragma solidity ^0.8.20; import "./Lib.sol"; contract Token {}',
        "contracts/Lib.sol": "pragma solidity ^0.8.20; library Lib {}",
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
    });

    it("should compile contracts with OpenZeppelin imports successfully", async () => {
      const files = {
        "contracts/MyToken.sol":
          'pragma solidity ^0.8.20; import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; contract MyToken is ERC20 { constructor() ERC20("MyToken", "MTK") {} }',
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
    });

    it("should handle solc output with no contracts compiled gracefully", async () => {
      const solc = require("solc");
      const solcSpy = jest.spyOn(solc, "compile").mockReturnValueOnce(
        JSON.stringify({
          contracts: {},
          errors: [],
        }),
      );

      const files = {
        "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}",
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.errors).toContain(
        "No contract compiled found in outputs",
      );

      solcSpy.mockRestore();
    });

    it("should handle compiler crash gracefully", async () => {
      const solc = require("solc");
      const solcSpy = jest.spyOn(solc, "compile").mockImplementationOnce(() => {
        throw new Error("Compiler crashed");
      });

      const files = {
        "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}",
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.errors).toContain("Compiler crashed");

      solcSpy.mockRestore();
    });

    it("should resolve import using exact match in projectFiles", async () => {
      const files = {
        "Token.sol":
          'pragma solidity ^0.8.20; import "Lib.sol"; contract Token {}',
        "Lib.sol": "pragma solidity ^0.8.20; library Lib {}",
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
    });

    it("should resolve import using endsWith fallback when path does not match exactly", async () => {
      const files = {
        "Token.sol":
          'pragma solidity ^0.8.20; import "Lib.sol"; contract Token {}',
        "contracts/Lib.sol": "pragma solidity ^0.8.20; library Lib {}",
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
    });

    it("should return error when import is not found", async () => {
      const files = {
        "contracts/Token.sol":
          'pragma solidity ^0.8.20; import "NonExistent.sol"; contract Token {}',
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(
        res.metadata.errors &&
          res.metadata.errors.some(
            (err: string) =>
              err.includes("not found") || err.includes("NonExistent.sol"),
          ),
      ).toBe(true);
    });

    it("should handle exception inside findImports catch block gracefully", async () => {
      const fs = require("fs");
      const readSpy = jest
        .spyOn(fs, "readFileSync")
        .mockImplementationOnce(() => {
          throw new Error("Disk read failure");
        });

      const files = {
        "contracts/Token.sol":
          'pragma solidity ^0.8.20; import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; contract Token {}',
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.errors).toBeDefined();

      readSpy.mockRestore();
    });

    it("should cover exact match branch in findImports by mocking solc.compile", async () => {
      const solc = require("solc");
      const solcSpy = jest
        .spyOn(solc, "compile")
        .mockImplementationOnce((inputStr: any, callbacks: any) => {
          if (callbacks && callbacks.import) {
            const importRes = callbacks.import("contracts/Lib.sol");
            expect(importRes.contents).toBeDefined();
          }
          return JSON.stringify({
            contracts: {
              "contracts/Token.sol": {
                Token: {
                  abi: [],
                  evm: { bytecode: { object: "0x6060" } },
                },
              },
            },
            errors: [],
          });
        });

      const files = {
        "contracts/Token.sol": "pragma solidity ^0.8.20; contract Token {}",
        "contracts/Lib.sol": "pragma solidity ^0.8.20; library Lib {}",
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);

      solcSpy.mockRestore();
    });

    it("should handle non-existent OpenZeppelin imports gracefully", async () => {
      const files = {
        "Token.sol":
          'pragma solidity ^0.8.20; import "@openzeppelin/contracts/NonExistent.sol"; contract Token {}',
      };
      const res = await engine.compile(files);
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
    });

    it("should fallback to err.message if err.formattedMessage is missing", async () => {
      const solc = require("solc");
      const solcSpy = jest.spyOn(solc, "compile").mockImplementationOnce(() => {
        return JSON.stringify({
          errors: [
            { severity: "error", message: "Compilation failed custom message" },
          ],
        });
      });

      const res = await engine.compile({
        "contracts/Token.sol": "pragma solidity ^0.8.20;",
      });
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.errors).toEqual([
        "Compilation failed custom message",
      ]);
      solcSpy.mockRestore();
    });

    it("should handle falsy output.contracts structure", async () => {
      const solc = require("solc");
      const solcSpy = jest.spyOn(solc, "compile").mockImplementationOnce(() => {
        return JSON.stringify({
          contracts: null,
        });
      });

      const res = await engine.compile({
        "contracts/Token.sol": "pragma solidity ^0.8.20;",
      });
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      solcSpy.mockRestore();
    });

    it("should handle falsy contract file entries in output.contracts", async () => {
      const solc = require("solc");
      const solcSpy = jest.spyOn(solc, "compile").mockImplementationOnce(() => {
        return JSON.stringify({
          contracts: {
            "contracts/Token.sol": null,
          },
        });
      });

      const res = await engine.compile({
        "contracts/Token.sol": "pragma solidity ^0.8.20;",
      });
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      solcSpy.mockRestore();
    });
  });

  describe("WalletEngine Unit Tests", () => {
    let walletEngine: WalletEngine;
    const testPrivateKey =
      "0x0123456789012345678901234567890123456789012345678901234567890123";

    beforeEach(() => {
      walletEngine = new WalletEngine();
    });

    it("should create a random wallet", async () => {
      const wallet = await walletEngine.createWallet();
      expect(wallet.address).toBeDefined();
      expect(wallet.privateKey).toBeDefined();
      expect(wallet.address.startsWith("0x")).toBe(true);
      expect(wallet.privateKey.startsWith("0x")).toBe(true);
    });

    it("should import a wallet from private key", async () => {
      const expectedWallet = new ethers.Wallet(testPrivateKey);
      const wallet = await walletEngine.importWallet(testPrivateKey);
      expect(wallet.address).toBe(expectedWallet.address);
      expect(wallet.privateKey).toBe(testPrivateKey);
    });

    it("should fail to import wallet with invalid private key", async () => {
      await expect(walletEngine.importWallet("invalid-key")).rejects.toThrow(
        "Invalid private key",
      );
    });

    it("should sign a transaction payload", async () => {
      const txPayload = {
        to: "0x0000000000000000000000000000000000000000",
        data: "0x",
        value: "1.0",
        gasLimit: 21000,
        nonce: 0,
      };
      const signed = await walletEngine.signTransaction(
        txPayload,
        testPrivateKey,
      );
      expect(signed).toBeDefined();
      expect(signed.startsWith("0x")).toBe(true);
    });

    it("should sign a transaction payload without value", async () => {
      const txPayload = {
        to: "0x0000000000000000000000000000000000000000",
        data: "0x",
        gasLimit: 21000,
        nonce: 0,
      };
      const signed = await walletEngine.signTransaction(
        txPayload,
        testPrivateKey,
      );
      expect(signed).toBeDefined();
    });

    it("should fail signing if transaction payload is invalid", async () => {
      const txPayload = {
        to: "invalid-address",
      };
      await expect(
        walletEngine.signTransaction(txPayload, testPrivateKey),
      ).rejects.toThrow();
    });

    it("should return mock transaction hash in mock env on sendTransaction", async () => {
      const txHash = await walletEngine.sendTransaction("0xmock-signed-tx");
      expect(txHash).toBe(
        "0xMockTxHashSend0000000000000000000000000000000000000000000000000789",
      );
    });

    it("should broadcast transaction in non-mock env", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY = testPrivateKey;

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const mockProvider = {
        broadcastTransaction: jest
          .fn()
          .mockResolvedValue({ hash: "0xBroadcastedTxHash" }),
      };
      const providerSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => mockProvider as any);

      const txHash = await walletEngine.sendTransaction("0xmock-signed-tx");
      expect(txHash).toBe("0xBroadcastedTxHash");
      expect(mockProvider.broadcastTransaction).toHaveBeenCalledWith(
        "0xmock-signed-tx",
      );

      providerSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });

    it("should throw error when broadcast fails in non-mock env", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY = testPrivateKey;

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const mockProvider = {
        broadcastTransaction: jest
          .fn()
          .mockRejectedValue(new Error("Network error")),
      };
      const providerSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => mockProvider as any);

      await expect(
        walletEngine.sendTransaction("0xmock-signed-tx"),
      ).rejects.toThrow("Network error");

      providerSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });
  });

  describe("Live Verification and Faucet Checks", () => {
    it("should abort deployment if deployer has 0 balance", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY =
        "0x1234567890123456789012345678901234567890123456789012345678901234";

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const mockProvider = {
        getBlockNumber: jest.fn().mockResolvedValue(1),
        getBalance: jest.fn().mockResolvedValue(0n),
      };
      const providerSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => mockProvider as any);
      const walletSpy = jest
        .spyOn(ethers, "Wallet")
        .mockImplementation(() => ({ address: "0xAddress" }) as any);

      const compileResult: any = {
        status: "success",
        action: "compile",
        metadata: { success: true, abi: [], bytecode: "0x6060" },
      };
      const deployResult = await engine.deployToTestnet(
        compileResult,
        "0x1234567890123456789012345678901234567890123456789012345678901234",
      );

      expect(deployResult.status).toBe("failure");
      expect(deployResult.metadata.errors?.[0]).toContain(
        "Please fund your account using the faucet",
      );

      providerSpy.mockRestore();
      walletSpy.mockRestore();

      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });

    it("should call live API to verify deployment successfully in non-mock mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY =
        "0x1234567890123456789012345678901234567890123456789012345678901234";

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const globalFetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue({ status: "1", result: "Verification ID" }),
      } as any);

      const res = await engine.verifyDeployment("0x123", "pragma solidity", {
        contractName: "MyToken",
      });
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
      expect(res.metadata.message).toContain(
        "Contract verified successfully: Verification ID",
      );
      expect(globalFetchSpy).toHaveBeenCalled();

      globalFetchSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });

    it("should handle live API verification failure in non-mock mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY =
        "0x1234567890123456789012345678901234567890123456789012345678901234";

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const globalFetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue({ status: "0", message: "Compilation error" }),
      } as any);

      const res = await engine.verifyDeployment("0x123", "pragma solidity");
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.message).toContain(
        "Verification failed: Compilation error",
      );

      globalFetchSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });

    it("should handle verification network/HTTP error gracefully", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY =
        "0x1234567890123456789012345678901234567890123456789012345678901234";

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const globalFetchSpy = jest
        .spyOn(global, "fetch")
        .mockRejectedValueOnce(new Error("Network offline"));

      const res = await engine.verifyDeployment("0x123", "pragma solidity");
      expect(res.status).toBe("failure");
      expect(res.metadata.success).toBe(false);
      expect(res.metadata.message).toContain(
        "Verification failed due to network/API error: Network offline",
      );

      globalFetchSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });
  });

  describe("ActionLayer Unit Tests", () => {
    let actionLayer: ActionLayer;
    const mockKey =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    beforeEach(() => {
      actionLayer = new ActionLayer();
    });

    it("should deploy contract via ActionLayer", async () => {
      const compileResult: any = {
        status: "success",
        action: "compile",
        metadata: { success: true, abi: [], bytecode: "0x6060" },
      };
      const res = await actionLayer.deployContract(compileResult, mockKey);
      expect(res.status).toBe("success");
      expect(res.metadata.contractAddress).toBeDefined();
    });

    it("should verify deployment via ActionLayer", async () => {
      const res = await actionLayer.verifyDeployment(
        "0x123",
        "pragma solidity",
      );
      expect(res.status).toBe("success");
      expect(res.metadata.success).toBe(true);
    });

    it("should execute callContract, mint, stake, swap, and transfer in mock mode", async () => {
      const resCall = await actionLayer.callContract(
        "0x123",
        [],
        "mint",
        [],
        mockKey,
      );
      expect(resCall.status).toBe("success");
      expect(resCall.txHash).toContain("Call");

      const resMint = await actionLayer.mint("0x123", "0xabc", "100", mockKey);
      expect(resMint.status).toBe("success");
      expect(resMint.txHash || resMint.metadata.transactionHash).toContain(
        "Mint",
      );

      const resStake = await actionLayer.stake("0x123", "100", mockKey);
      expect(resStake.status).toBe("success");
      expect(resStake.txHash || resStake.metadata.transactionHash).toContain(
        "Stake",
      );

      const resSwap = await actionLayer.swap("0x123", "0xabc", "100", mockKey);
      expect(resSwap.status).toBe("success");
      expect(resSwap.txHash || resSwap.metadata.transactionHash).toContain(
        "Swap",
      );

      const resTransfer = await actionLayer.transfer("0xabc", "100", mockKey);
      expect(resTransfer.status).toBe("success");
      expect(
        resTransfer.txHash || resTransfer.metadata.transactionHash,
      ).toContain("Transfer");

      const resTransferToken = await actionLayer.transfer(
        "0xabc",
        "100",
        mockKey,
        "0x456",
      );
      expect(resTransferToken.status).toBe("success");
      expect(
        resTransferToken.txHash || resTransferToken.metadata.transactionHash,
      ).toContain("Transfer");
    });

    it("should test callContract non-mock pure/view functions", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY = mockKey;

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const mockContractInstance = {
        interface: {
          getFunction: jest.fn().mockReturnValue({
            constant: true,
            stateMutability: "view",
          }),
        },
        myViewMethod: jest.fn().mockResolvedValue("ViewResult"),
      };

      const providerSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => ({}) as any);
      const walletSpy = jest
        .spyOn(ethers, "Wallet")
        .mockImplementation(() => ({}) as any);
      const contractSpy = jest
        .spyOn(ethers, "Contract")
        .mockImplementation(() => mockContractInstance as any);

      const abi = ["function myViewMethod() public view returns (string)"];
      const result = await actionLayer.callContract(
        "0x123",
        abi,
        "myViewMethod",
        [],
        mockKey,
      );
      expect(result.metadata.data).toBe("ViewResult");

      providerSpy.mockRestore();
      walletSpy.mockRestore();
      contractSpy.mockRestore();

      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });

    it("should test callContract non-mock state-changing functions", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.DEPLOYER_PRIVATE_KEY;
      process.env.NODE_ENV = "production";
      process.env.DEPLOYER_PRIVATE_KEY = mockKey;

      const { resetConfigForTesting } = require("@monadforge/sdk");
      resetConfigForTesting();

      const mockTx = {
        hash: "0xRealTxHash",
        wait: jest.fn().mockResolvedValue({ gasUsed: 50000n }),
      };

      const mockContractInstance = {
        interface: {
          getFunction: jest.fn().mockReturnValue({
            constant: false,
            stateMutability: "nonpayable",
          }),
        },
        myWriteMethod: jest.fn().mockResolvedValue(mockTx),
      };

      const providerSpy = jest
        .spyOn(ethers, "JsonRpcProvider")
        .mockImplementation(() => ({}) as any);
      const walletSpy = jest
        .spyOn(ethers, "Wallet")
        .mockImplementation(() => ({}) as any);
      const contractSpy = jest
        .spyOn(ethers, "Contract")
        .mockImplementation(() => mockContractInstance as any);

      const abi = ["function myWriteMethod() public"];
      const result = await actionLayer.callContract(
        "0x123",
        abi,
        "myWriteMethod",
        [],
        mockKey,
      );
      expect(result.status).toBe("success");
      expect(result.txHash).toBe("0xRealTxHash");
      expect(result.metadata.gasUsed).toBe("50000");

      providerSpy.mockRestore();
      walletSpy.mockRestore();
      contractSpy.mockRestore();

      process.env.NODE_ENV = originalEnv;
      if (originalKey) {
        process.env.DEPLOYER_PRIVATE_KEY = originalKey;
      } else {
        delete process.env.DEPLOYER_PRIVATE_KEY;
      }
      resetConfigForTesting();
    });

    it("should deploy upgradeable contract in mock mode", async () => {
      const compileResult: any = {
        status: "success",
        action: "compile",
        metadata: { success: true, abi: [], bytecode: "0x6060" },
      };
      const deployResult = await engine.deployUpgradeable(
        compileResult,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        ["arg1"],
        "initialize",
      );

      expect(deployResult.status).toBe("success");
      expect(deployResult.metadata.proxyAddress).toBeDefined();
      expect(deployResult.metadata.implementationAddress).toBeDefined();
      expect(deployResult.metadata.gasUsed).toBe("250000");
    });

    it("should estimate gas fees correctly using eth_feeHistory", async () => {
      const { MonadJsonRpcProvider } = require("../src/index");
      const provider = new MonadJsonRpcProvider("http://localhost:8545");

      const sendSpy = jest
        .spyOn(provider, "send")
        .mockImplementation(async (method: any) => {
          if (method === "eth_feeHistory") {
            return {
              baseFeePerGas: ["100000000", "120000000"],
              reward: [["500000000"], ["400000000"]],
            };
          }
          throw new Error("unsupported");
        });

      const feeData = await provider.getFeeData();
      expect(feeData.maxFeePerGas).toBeDefined();
      expect(feeData.maxPriorityFeePerGas?.toString()).toBe("500000000");
      expect(feeData.maxFeePerGas?.toString()).toBe("650000000");
      sendSpy.mockRestore();
    });

    it("should fall back to eth_gasPrice if eth_feeHistory fails", async () => {
      const { MonadJsonRpcProvider } = require("../src/index");
      const provider = new MonadJsonRpcProvider("http://localhost:8545");

      const sendSpy = jest
        .spyOn(provider, "send")
        .mockImplementation(async (method: any) => {
          if (method === "eth_gasPrice") {
            return "0x2540be400";
          }
          throw new Error("unsupported");
        });

      const feeData = await provider.getFeeData();
      expect(feeData.maxFeePerGas?.toString()).toBe("10000000000");
      expect(feeData.maxPriorityFeePerGas).toBeNull();
      expect(feeData.gasPrice?.toString()).toBe("10000000000");
      sendSpy.mockRestore();
    });

    it("should return static defaults if both RPC calls fail", async () => {
      const { MonadJsonRpcProvider } = require("../src/index");
      const provider = new MonadJsonRpcProvider("http://localhost:8545");

      const sendSpy = jest
        .spyOn(provider, "send")
        .mockRejectedValue(new Error("RPC Error"));

      const feeData = await provider.getFeeData();
      expect(feeData.maxFeePerGas?.toString()).toBe("100000000");
      expect(feeData.maxPriorityFeePerGas).toBeNull();
      sendSpy.mockRestore();
    });
  });
});
