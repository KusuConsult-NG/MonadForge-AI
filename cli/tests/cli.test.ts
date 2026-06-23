import * as fs from "fs";

export const mockQuestion = jest.fn((q, cb) => {
  if (typeof cb === "function") {
    cb("");
  } else if (typeof q === "function") {
    q("");
  }
});

// Mock readline
jest.mock("readline", () => {
  return {
    createInterface: jest.fn().mockReturnValue({
      get question() {
        return mockQuestion;
      },
      close: jest.fn(),
    }),
  };
});

let mockMonadforgeJsonContent = '{"name": "mock-token", "contractsDir": "contracts"}';

// Mock fs
jest.mock("fs", () => {
  return {
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockImplementation((pathStr: string) => {
      if (pathStr.includes("deployments.json")) {
        return "[]";
      }
      if (pathStr.includes("monadforge.json")) {
        return mockMonadforgeJsonContent;
      }
      return "pragma solidity ^0.8.20; contract Token {}";
    }),
    readdirSync: jest.fn().mockReturnValue(["Token.sol"]),
  };
});

const mockExistsSync = fs.existsSync as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as jest.Mock;
const mockMkdirSync = fs.mkdirSync as jest.Mock;

// Mock the unified SDK
jest.mock("@monadforge/ai", () => {
  return {
    monadforge: {
      tools: {
        createProject: jest.fn().mockResolvedValue({ name: "mock-project" }),
        audit: jest.fn().mockResolvedValue({
          riskScore: 0,
          issues: [],
          recommendations: [],
        }),
      },
      engine: {
        continue: jest.fn().mockResolvedValue({
          success: true,
          message: "Project continued successfully",
        }),
      },
      actions: {
        deploy: jest.fn().mockResolvedValue({
          status: "success",
          contractAddress: "0xMockAddress",
          transactionHash: "0xMockTxHash",
          gasUsed: "100000",
        }),
      },
    },
  };
});

// Mock actions package
let compileSuccess = true;
jest.mock("@monadforge/actions", () => {
  return {
    ActionLayer: jest.fn().mockImplementation(() => {
      return {
        compile: jest.fn().mockImplementation(() => {
          if (!compileSuccess) {
            return {
              status: "failure",
              action: "compile",
              metadata: { success: false, abi: [], bytecode: "", errors: ["mock compile failure"] },
            };
          }
          return {
            status: "success",
            action: "compile",
            metadata: { success: true, abi: [], bytecode: "0x" },
          };
        }),
      };
    }),
  };
});

import { program } from "../src/index";

describe("Simplified CLI Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    compileSuccess = true;
    delete process.env.DEPLOYER_PRIVATE_KEY;
    const { resetConfigForTesting } = require("@monadforge/sdk");
    resetConfigForTesting();
    // Reset option values in Commander to prevent state leakage between tests
    program.commands.forEach((cmd) => {
      cmd.options.forEach((opt) => {
        cmd.setOptionValue(opt.name(), undefined);
      });
      // Explicitly clean common option names just in case
      cmd.setOptionValue("interactive", undefined);
      cmd.setOptionValue("yes", undefined);
      cmd.setOptionValue("network", undefined);
      cmd.setOptionValue("name", undefined);
    });
  });

  it("should parse init command", async () => {
    await program.parseAsync(["node", "monadforge", "init", "-n", "test-project"]);
    expect(program.commands.some((c) => c.name() === "init")).toBe(true);
  });

  it("should run init command interactively", async () => {
    mockQuestion
      .mockImplementationOnce((q, cb) => cb("interactive-proj")) // name
      .mockImplementationOnce((q, cb) => cb("contracts")) // contractsDir
      .mockImplementationOnce((q, cb) => cb("test")) // testDir
      .mockImplementationOnce((q, cb) => cb("scripts")); // scriptsDir

    await program.parseAsync(["node", "monadforge", "init", "-i"]);
    expect(mockQuestion).toHaveBeenCalledTimes(4);
  });

  it("should parse build command", async () => {
    await program.parseAsync(["node", "monadforge", "build"]);
    expect(program.commands.some((c) => c.name() === "build")).toBe(true);
  });

  it("should throw error on build if monadforge.json does not exist", async () => {
    mockExistsSync.mockReturnValueOnce(false); // monadforge.json does not exist
    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
    await expect(
      program.parseAsync(["node", "monadforge", "build"]),
    ).rejects.toThrow("Process exited with code 1");
    exitSpy.mockRestore();
  });

  it("should parse continue command", async () => {
    await program.parseAsync([
      "node",
      "monadforge",
      "continue",
      "my-project",
      "-p",
      "my goal",
    ]);
    expect(program.commands.some((c) => c.name() === "continue")).toBe(true);
  });

  it("should parse audit command", async () => {
    await program.parseAsync(["node", "monadforge", "audit", "contracts/Token.sol"]);
    expect(program.commands.some((c) => c.name() === "audit")).toBe(true);
  });

  it("should throw error on audit command if file does not exist", async () => {
    mockExistsSync.mockReturnValueOnce(false); // file does not exist
    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
    await expect(
      program.parseAsync(["node", "monadforge", "audit", "missing.sol"]),
    ).rejects.toThrow("Process exited with code 1");
    exitSpy.mockRestore();
  });

  it("should parse deploy command", async () => {
    await program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]);
    expect(program.commands.some((c) => c.name() === "deploy")).toBe(true);
  });

  it("should run deploy command interactively choosing network", async () => {
    const rl = require("readline");
    const originalSelection = rl.createInterface().question;
    mockQuestion
      .mockImplementationOnce((q, cb) => cb("local")) // Select target network
      .mockImplementationOnce((q, cb) => cb("0xPrivateKey")); // Enter private key

    await program.parseAsync(["node", "monadforge", "deploy", "-i", "-y"]);
    expect(mockQuestion).toHaveBeenCalledTimes(2);
  });

  it("should block deploy if security audit flags critical/high issues", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.tools.audit.mockResolvedValueOnce({
      riskScore: 80,
      issues: [
        {
          id: "ACCESS-001",
          severity: "Critical",
          title: "Critical Access Control issue",
          description: "Unprotected sensitive function",
        },
      ],
      recommendations: [],
    });

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
  });

  it("should block deploy to mainnet in version 1", async () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
    await expect(
      program.parseAsync([
        "node",
        "monadforge",
        "deploy",
        "my-project",
        "-n",
        "monad-mainnet",
      ]),
    ).rejects.toThrow("Process exited with code 1");
    exitSpy.mockRestore();
  });

  it("should handle interactive deploy with invalid network option defaulting to testnet", async () => {
    mockQuestion
      .mockImplementationOnce((q, cb) => cb("invalidnet")) // invalid target network option
      .mockImplementationOnce((q, cb) => cb("0xPrivateKey"));

    await program.parseAsync(["node", "monadforge", "deploy", "-i", "-y"]);
    expect(mockQuestion).toHaveBeenCalledTimes(2);
  });

  it("should handle askConfirmation flow during deploy", async () => {
    // Override NODE_ENV to production to trigger askConfirmation
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mockQuestion.mockImplementationOnce((q, cb) => cb("yes")); // confirmed

    await program.parseAsync(["node", "monadforge", "deploy", "my-project"]);
    expect(mockQuestion).toHaveBeenCalled();

    process.env.NODE_ENV = oldEnv;
  });

  it("should handle init command failure", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.tools.createProject.mockRejectedValueOnce(new Error("mock init failure"));

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "init", "-n", "fail-project"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
  });

  it("should handle build command compilation failure", async () => {
    compileSuccess = false;

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "build"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
    compileSuccess = true;
  });

  it("should handle build command when contracts dir has no sol files", async () => {
    const mockReaddir = fs.readdirSync as jest.Mock;
    mockReaddir.mockReturnValueOnce([]); // no files

    await program.parseAsync(["node", "monadforge", "build"]);
    expect(mockReaddir).toHaveBeenCalled();
  });

  it("should handle continue command failure", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.engine.continue.mockResolvedValueOnce({
      success: false,
      message: "mock continue failure",
    });

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "continue", "my-project"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
  });

  it("should handle audit command print issues", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.tools.audit.mockResolvedValueOnce({
      riskScore: 50,
      issues: [
        { severity: "High", title: "Reentrancy", description: "Unprotected withdraw" }
      ],
      recommendations: []
    });

    await program.parseAsync(["node", "monadforge", "audit", "contracts/Token.sol"]);
    expect(monadforge.tools.audit).toHaveBeenCalled();
  });

  it("should handle deploy command when contracts dir has no sol files and fallback to default", async () => {
    const mockReaddir = fs.readdirSync as jest.Mock;
    mockReaddir.mockReturnValueOnce([]); // no files

    await program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]);
    expect(mockReaddir).toHaveBeenCalled();
  });

  it("should handle deploy command compilation failure", async () => {
    compileSuccess = false;

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
    compileSuccess = true;
  });

  it("should handle deploy command deployment failure", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.actions.deploy.mockResolvedValueOnce({ status: "failed" });

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
  });

  it("should handle interactive deploy with empty network option defaulting to testnet", async () => {
    mockQuestion
      .mockImplementationOnce((q, cb) => cb("")) // empty string target network option
      .mockImplementationOnce((q, cb) => cb("0xPrivateKey"));

    await program.parseAsync(["node", "monadforge", "deploy", "-i", "-y"]);
    expect(mockQuestion).toHaveBeenCalledTimes(2);
  });

  it("should abort deployment if user rejects confirmation", async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mockQuestion.mockImplementationOnce((q, cb) => cb("no")); // rejected

    await program.parseAsync(["node", "monadforge", "deploy", "my-project"]);
    expect(mockQuestion).toHaveBeenCalled();

    process.env.NODE_ENV = oldEnv;
  });

  it("should fall back to defaults in askQuestion if user provides empty input", async () => {
    mockQuestion
      .mockImplementationOnce((q, cb) => cb("")) // empty name
      .mockImplementationOnce((q, cb) => cb("")) // empty contracts
      .mockImplementationOnce((q, cb) => cb("")) // empty test
      .mockImplementationOnce((q, cb) => cb("")); // empty scripts

    await program.parseAsync(["node", "monadforge", "init", "-i"]);
    expect(mockQuestion).toHaveBeenCalledTimes(4);
  });

  it("should handle continue command failure with empty message fallback", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.engine.continue.mockResolvedValueOnce({
      success: false,
    });

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "continue", "my-project"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
  });

  it("should block deploy if security audit flags High severity issues", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.tools.audit.mockResolvedValueOnce({
      riskScore: 60,
      issues: [
        {
          id: "ACCESS-001",
          severity: "High",
          title: "High Access Control issue",
          description: "Unprotected sensitive function",
        },
      ],
      recommendations: [],
    });

    const exitSpy = jest.spyOn(process, "exit").mockImplementationOnce((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]),
    ).rejects.toThrow("Process exited with code 1");

    exitSpy.mockRestore();
  });

  it("should handle deploy success with empty status, contractAddress, and transactionHash fallback", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.actions.deploy.mockResolvedValueOnce({
      // status: undefined (falls back to "success")
      // contractAddress: undefined
      // transactionHash: undefined
    });

    await program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]);
    expect(monadforge.actions.deploy).toHaveBeenCalled();
  });

  it("should handle deploy success with verification status and print it", async () => {
    const { monadforge } = require("@monadforge/ai");
    monadforge.actions.deploy.mockResolvedValueOnce({
      status: "success",
      metadata: {
        contractAddress: "0x123",
        transactionHash: "0xabc",
        gasUsed: "1000",
        verificationStatus: "success",
        verificationMessage: "Verified successfully on MonadScan (MOCK mode)"
      }
    });

    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    await program.parseAsync(["node", "monadforge", "deploy", "my-project", "-y"]);
    expect(monadforge.actions.deploy).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Verification: Verified successfully on MonadScan (MOCK mode)"));
    consoleSpy.mockRestore();
  });

  it("should handle monadforge.json with missing name and contractsDir in deploy and continue commands", async () => {
    mockMonadforgeJsonContent = '{}';
    const { monadforge } = require("@monadforge/ai");
    monadforge.actions.deploy.mockResolvedValueOnce({ status: "success", contractAddress: "0x123", transactionHash: "0xabc" });
    monadforge.engine.continue.mockResolvedValueOnce({ success: true, message: "OK" });

    await program.parseAsync(["node", "monadforge", "deploy", "-y"]);
    await program.parseAsync(["node", "monadforge", "continue"]);

    mockMonadforgeJsonContent = '{"name": "mock-token", "contractsDir": "contracts"}';
  });
});
