import { createMcpServer } from "../src/index";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";

// Mock memory engine
const mockLoadProjectContext = jest.fn();
jest.mock("@monadforge/memory", () => {
  return {
    MemoryEngine: jest.fn().mockImplementation(() => {
      return {
        loadProjectContext: mockLoadProjectContext,
      };
    }),
  };
});

// Mock the unified SDK
jest.mock("@monadforge/ai", () => {
  return {
    monadforge: {
      tools: {
        createProject: jest.fn().mockResolvedValue({ name: "mock-project" }),
        compose: jest.fn().mockResolvedValue({ success: true, steps: [] }),
        audit: jest.fn().mockResolvedValue({ riskScore: 10, issues: [] }),
        repair: jest.fn().mockResolvedValue({ success: true }),
        review: jest.fn().mockResolvedValue("Review completed"),
      },
      engine: {
        run: jest.fn().mockResolvedValue({ success: true }),
        continue: jest.fn().mockResolvedValue({ success: true }),
      },
      actions: {
        deploy: jest.fn().mockResolvedValue({ status: "success", contractAddress: "0x123", transactionHash: "0xabc" }),
      },
    },
  };
});

// Mock actions package
jest.mock("@monadforge/actions", () => {
  return {
    ActionLayer: jest.fn().mockImplementation(() => {
      return {
        compile: jest.fn().mockResolvedValue({ success: true }),
      };
    }),
  };
});

let mockMonadforgeJsonContent = '{"contractsDir": "contracts"}';

// Mock fs
jest.mock("fs", () => {
  return {
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockImplementation((pathStr: string) => {
      if (pathStr.includes("monadforge.json")) {
        return mockMonadforgeJsonContent;
      }
      return "contract Mock {}";
    }),
    readdirSync: jest.fn().mockReturnValue(["Token.sol"]),
  };
});

const mockExistsSync = fs.existsSync as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;
const mockReaddirSync = fs.readdirSync as jest.Mock;

describe("MCP Server Unit Tests", () => {
  let server: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("contract Mock {}");
    mockReaddirSync.mockReturnValue(["Token.sol"]);
    mockLoadProjectContext.mockResolvedValue({
      projectId: "test-project",
      contracts: { "contracts/Token.sol": "contract Token {}" },
      deployments: [],
    });
  });

  it("should list exactly 9 required tools", async () => {
    server = createMcpServer();
    const listToolsHandler = server._requestHandlers.get("tools/list");
    expect(listToolsHandler).toBeDefined();

    const response = await listToolsHandler({ method: "tools/list" });
    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBe(9);

    const names = response.tools.map((t: any) => t.name);
    expect(names).toContain("create_project");
    expect(names).toContain("generate_contract");
    expect(names).toContain("compose_application");
    expect(names).toContain("audit_project");
    expect(names).toContain("repair_project");
    expect(names).toContain("deploy_project");
    expect(names).toContain("continue_project");
    expect(names).toContain("review_architecture");
    expect(names).toContain("get_project_context");
  });

  describe("Tool Call Invocations", () => {
    let callToolHandler: any;

    beforeEach(() => {
      server = createMcpServer();
      callToolHandler = server._requestHandlers.get("tools/call");
      expect(callToolHandler).toBeDefined();
    });

    it("should call create_project", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "create_project",
          arguments: { name: "new-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.name).toBe("mock-project");
    });

    it("should call generate_contract", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "generate_contract",
          arguments: {
            name: "MyToken",
            symbol: "MTK",
            supply: "1000",
            rewardToken: "0x1",
            stakingToken: "0x2",
            governanceToken: "0x3",
            type: "token",
            prompt: "highly secure",
          },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call generate_contract with minimal args", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "generate_contract",
          arguments: {
            name: "MyToken",
          },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call compose_application", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "compose_application",
          arguments: { goal: "Build a DEX" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call audit_project with filePath", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "audit_project",
          arguments: { projectId: "test-project", filePath: "contracts/Token.sol" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content["contracts/Token.sol"]).toBeDefined();
    });

    it("should call audit_project without filePath (reading directory)", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "audit_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(Object.keys(content).length).toBeGreaterThan(0);
    });

    it("should call audit_project fallback to memory context when local directory has no contracts", async () => {
      mockExistsSync.mockReturnValue(false); // contractsDir doesn't exist

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "audit_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(Object.keys(content).length).toBeGreaterThan(0);
    });

    it("should call audit_project with missing filePath fallback to memory", async () => {
      mockExistsSync.mockReturnValue(false); // file doesn't exist on disk

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "audit_project",
          arguments: { projectId: "test-project", filePath: "contracts/Token.sol" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content["contracts/Token.sol"]).toBeDefined();
    });

    it("should reject audit_project with missing filePath when memory also lacks it", async () => {
      mockExistsSync.mockReturnValue(false);
      mockLoadProjectContext.mockResolvedValueOnce({ contracts: {} });

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "audit_project",
          arguments: { projectId: "test-project", filePath: "contracts/Token.sol" },
        },
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("File not found");
    });

    it("should reject audit_project when no contracts found anywhere", async () => {
      mockExistsSync.mockReturnValue(false);
      mockLoadProjectContext.mockResolvedValueOnce(null);

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "audit_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("No contracts found to audit");
    });

    it("should call repair_project", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "repair_project",
          arguments: { projectId: "test-project", errors: ["Error parsing"] },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call repair_project using local files when memory is empty", async () => {
      mockLoadProjectContext.mockResolvedValueOnce(null);
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "repair_project",
          arguments: { projectId: "test-project", errors: ["Error parsing"] },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call repair_project falling back to default contract when both memory and local files are empty", async () => {
      mockLoadProjectContext.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(false); // contractsDir doesn't exist

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "repair_project",
          arguments: { projectId: "test-project", errors: ["Error parsing"] },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call deploy_project", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "deploy_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.status).toBe("success");
    });

    it("should call deploy_project falling back to memory when local files do not exist", async () => {
      mockExistsSync.mockReturnValue(false); // contractsDir doesn't exist

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "deploy_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.status).toBe("success");
    });

    it("should call deploy_project falling back to default contract when both local files and memory are empty", async () => {
      mockExistsSync.mockReturnValue(false); // contractsDir doesn't exist
      mockLoadProjectContext.mockResolvedValueOnce(null);

      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "deploy_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.status).toBe("success");
    });

    it("should call continue_project", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "continue_project",
          arguments: { projectId: "test-project", prompt: "resume goal" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should call review_architecture with contracts", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "review_architecture",
          arguments: {
            contracts: { "Token.sol": "contract Token {}" },
            code: "contract B {}",
            design: "AMM design",
            architecture: "L2 scaling",
          },
        },
      });
      expect(response.isError).toBeUndefined();
      expect(response.content[0].text).toContain("Review completed");
    });

    it("should call review_architecture without contracts", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "review_architecture",
          arguments: {
            code: "contract B {}",
            design: "AMM design",
            architecture: "L2 scaling",
          },
        },
      });
      expect(response.isError).toBeUndefined();
      expect(response.content[0].text).toContain("Review completed");
    });

    it("should call get_project_context", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "get_project_context",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      const content = JSON.parse(response.content[0].text);
      expect(content.projectId).toBe("test-project");
    });

    it("should handle invalid monadforge.json in getContractsDirName catch block", async () => {
      mockMonadforgeJsonContent = "{invalid json}";
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "deploy_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      mockMonadforgeJsonContent = '{"contractsDir": "contracts"}';
    });

    it("should handle monadforge.json with missing contractsDir", async () => {
      mockMonadforgeJsonContent = '{"name": "test-project"}';
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "deploy_project",
          arguments: { projectId: "test-project" },
        },
      });
      expect(response.isError).toBeUndefined();
      mockMonadforgeJsonContent = '{"contractsDir": "contracts"}';
    });

    it("should reject unknown tool name", async () => {
      const response = await callToolHandler({
        method: "tools/call",
        params: {
          name: "invalid_tool",
          arguments: {},
        },
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Tool not found: invalid_tool");
    });
  });

  describe("MCP Server Startup", () => {
    it("should successfully run startServer", async () => {
      const connectSpy = jest
        .spyOn(
          require("@modelcontextprotocol/sdk/server/index.js").Server.prototype,
          "connect",
        )
        .mockResolvedValue(undefined as any);

      const { startServer } = require("../src/index");
      await expect(startServer()).resolves.toBeUndefined();

      expect(connectSpy).toHaveBeenCalled();
      connectSpy.mockRestore();
    });

    it("should propagate connect failure in startServer", async () => {
      const connectSpy = jest
        .spyOn(
          require("@modelcontextprotocol/sdk/server/index.js").Server.prototype,
          "connect",
        )
        .mockRejectedValue(new Error("Connection failed"));

      const { startServer } = require("../src/index");
      await expect(startServer()).rejects.toThrow("Connection failed");

      expect(connectSpy).toHaveBeenCalled();
      connectSpy.mockRestore();
    });
  });
});
