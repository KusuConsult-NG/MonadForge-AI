import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "@monadforge/sdk";
import { monadforge } from "@monadforge/ai";
import { MemoryEngine } from "@monadforge/memory";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("MCP");

function getContractsDirName(): string {
  try {
    const configPath = path.resolve(process.cwd(), "monadforge.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return config.contractsDir || "contracts";
    }
  } catch (e) {}
  return "contracts";
}

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "monadforge-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info("List tools request received");
    return {
      tools: [
        {
          name: "create_project",
          description: "Initialize a new MonadForge AI project structure.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "The name of the project." },
            },
            required: ["name"],
          },
        },
        {
          name: "generate_contract",
          description: "Generate smart contracts using AI matching specified parameters.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name of the contract." },
              symbol: { type: "string", description: "Token symbol (optional)." },
              supply: { type: "string", description: "Initial supply (optional)." },
              rewardToken: { type: "string", description: "Staking reward token (optional)." },
              stakingToken: { type: "string", description: "Staked token address (optional)." },
              governanceToken: { type: "string", description: "DAO governance token (optional)." },
              type: { type: "string", description: "Type of contract, e.g. token, nft, staking, dao (optional)." },
              prompt: { type: "string", description: "Additional natural language description or features (optional)." },
            },
            required: ["name"],
          },
        },
        {
          name: "compose_application",
          description: "Compose a multi-skill software system workflow.",
          inputSchema: {
            type: "object",
            properties: {
              goal: { type: "string", description: "The target goal of the composed system." },
            },
            required: ["goal"],
          },
        },
        {
          name: "audit_project",
          description: "Audit smart contracts in the project directory for vulnerabilities.",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string", description: "The project ID." },
              filePath: { type: "string", description: "Optional relative file path of a single contract to audit." },
            },
            required: ["projectId"],
          },
        },
        {
          name: "repair_project",
          description: "Run the self-healing repair loop on failing components or contracts.",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string", description: "The project ID." },
              errors: { type: "array", items: { type: "string" }, description: "Compilation or security errors to repair." },
            },
            required: ["projectId", "errors"],
          },
        },
        {
          name: "deploy_project",
          description: "Compile, scan, and deploy project contracts to Monad Testnet.",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string", description: "The project ID." },
            },
            required: ["projectId"],
          },
        },
        {
          name: "continue_project",
          description: "Continue project development using context memory.",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string", description: "The project ID." },
              prompt: { type: "string", description: "Next feature or instruction to implement." },
            },
            required: ["projectId", "prompt"],
          },
        },
        {
          name: "review_architecture",
          description: "Review the system or protocol design, security model, and scalability.",
          inputSchema: {
            type: "object",
            properties: {
              contracts: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Record of contract names to source code.",
              },
              design: { type: "string", description: "Natural language design description." },
              code: { type: "string", description: "Solidity code block to review." },
              architecture: { type: "string", description: "Scalability/architecture overview." },
            },
          },
        },
        {
          name: "get_project_context",
          description: "Retrieve the memory context (contracts, deployments, planning history) for a project.",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string", description: "The project ID." },
            },
            required: ["projectId"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Tool call received: ${name}`, {
      operation: "call_tool",
      status: "pending",
    });

    try {
      let result;
      const memoryEngine = new MemoryEngine();

      switch (name) {
        case "create_project": {
          const { name: projName } = args as any;
          result = await monadforge.tools.createProject({ name: projName });
          break;
        }
        case "generate_contract": {
          const {
            name: cName,
            symbol,
            supply,
            rewardToken,
            stakingToken,
            governanceToken,
            type,
            prompt,
          } = args as any;
          let goal = `Generate a contract of type ${type || "token"} named ${cName}`;
          if (symbol) goal += `, symbol ${symbol}`;
          if (supply) goal += `, initial supply ${supply}`;
          if (rewardToken) goal += `, reward token ${rewardToken}`;
          if (stakingToken) goal += `, staking token ${stakingToken}`;
          if (governanceToken) goal += `, governance token ${governanceToken}`;
          if (prompt) goal += `. Prompt: ${prompt}`;

          result = await monadforge.engine.run({ goal });
          break;
        }
        case "compose_application": {
          const { goal } = args as any;
          result = await monadforge.tools.compose(goal);
          break;
        }
        case "audit_project": {
          const { projectId, filePath } = args as any;
          let codeMap: Record<string, string> = {};
          if (filePath) {
            const fullPath = path.resolve(process.cwd(), filePath);
            if (fs.existsSync(fullPath)) {
              codeMap[filePath] = fs.readFileSync(fullPath, "utf8");
            } else {
              // Try project memory fallback
              const ctx = await memoryEngine.loadProjectContext(projectId);
              if (ctx && ctx.contracts[filePath]) {
                codeMap[filePath] = ctx.contracts[filePath];
              } else {
                throw new Error(`File not found: ${filePath}`);
              }
            }
          } else {
            // Read all contracts from directory or memory
            const contractsDirName = getContractsDirName();
            const contractsDir = path.resolve(process.cwd(), contractsDirName);
            if (fs.existsSync(contractsDir)) {
              const files = fs.readdirSync(contractsDir);
              for (const file of files) {
                if (file.endsWith(".sol")) {
                  codeMap[path.join(contractsDirName, file)] = fs.readFileSync(
                    path.join(contractsDir, file),
                    "utf8",
                  );
                }
              }
            }
            if (Object.keys(codeMap).length === 0) {
              const ctx = await memoryEngine.loadProjectContext(projectId);
              if (ctx && ctx.contracts) {
                codeMap = ctx.contracts;
              }
            }
          }

          if (Object.keys(codeMap).length === 0) {
            throw new Error(`No contracts found to audit in project ${projectId}`);
          }

          const auditReports: Record<string, any> = {};
          for (const key of Object.keys(codeMap)) {
            auditReports[key] = await monadforge.tools.audit(codeMap[key]);
          }
          result = auditReports;
          break;
        }
        case "repair_project": {
          const { projectId, errors } = args as any;
          const ctx = await memoryEngine.loadProjectContext(projectId);
          let code = "";
          if (ctx && Object.keys(ctx.contracts).length > 0) {
            code = Object.values(ctx.contracts)[0];
          } else {
            // Try loading from files
            const contractsDirName = getContractsDirName();
            const contractsDir = path.resolve(process.cwd(), contractsDirName);
            if (fs.existsSync(contractsDir)) {
              const files = fs.readdirSync(contractsDir).filter(f => f.endsWith(".sol"));
              if (files.length > 0) {
                code = fs.readFileSync(path.join(contractsDir, files[0]), "utf8");
              }
            }
          }
          if (!code) {
            code = "pragma solidity ^0.8.20; contract Token {}";
          }
          result = await monadforge.tools.repair(code, errors);
          break;
        }
        case "deploy_project": {
          const { projectId } = args as any;
          let contracts: Record<string, string> = {};
          const contractsDirName = getContractsDirName();
          const contractsDir = path.resolve(process.cwd(), contractsDirName);
          if (fs.existsSync(contractsDir)) {
            const files = fs.readdirSync(contractsDir);
            for (const file of files) {
              if (file.endsWith(".sol")) {
                contracts[path.join(contractsDirName, file)] = fs.readFileSync(
                  path.join(contractsDir, file),
                  "utf8",
                );
              }
            }
          }
          if (Object.keys(contracts).length === 0) {
            const ctx = await memoryEngine.loadProjectContext(projectId);
            if (ctx) contracts = ctx.contracts;
          }
          if (Object.keys(contracts).length === 0) {
            contracts[path.join(contractsDirName, "Token.sol")] = "pragma solidity ^0.8.20; contract Token {}";
          }

          const { ActionLayer } = require("@monadforge/actions");
          const actionLayer = new ActionLayer();
          const compResult = await actionLayer.compile(contracts);
          result = await monadforge.actions.deploy(compResult);
          break;
        }
        case "continue_project": {
          const { projectId, prompt } = args as any;
          result = await monadforge.engine.continue({ projectId, prompt });
          break;
        }
        case "review_architecture": {
          const { contracts, design, code, architecture } = args as any;
          const contractsRecord = contracts ? { ...contracts } : {};
          if (code) {
            contractsRecord["code_block.sol"] = code;
          }
          if (design) {
            contractsRecord["design_review.txt"] = design;
          }
          if (architecture) {
            contractsRecord["architecture_review.txt"] = architecture;
          }
          result = await monadforge.tools.review(contractsRecord);
          break;
        }
        case "get_project_context": {
          const { projectId } = args as any;
          result = await memoryEngine.loadProjectContext(projectId);
          break;
        }
        default:
          throw new Error(`Tool not found: ${name}`);
      }

      logger.info(`Tool execution completed: ${name}`, {
        operation: "call_tool",
        status: "success",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      logger.error(`Tool execution failed: ${name}`, err, {
        operation: "call_tool",
        status: "error",
      });
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    logger.info("MCP Server running on Stdio transport");
  } catch (err: any) {
    logger.critical("MCP Server connection failed", err);
    throw err;
  }
}

/* istanbul ignore next */
if (require.main === module) {
  startServer().catch(() => {});
}
