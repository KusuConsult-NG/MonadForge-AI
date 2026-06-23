import { AgentManifestSchema, SkillPackageSchema } from "@monadforge/sdk";

export const DEFAULT_MANIFEST = {
  agentId: "monadforge-ai",
  name: "MonadForge AI Agent",
  version: "1.0.0",
  description: "Autonomous Agent Hub-compatible Execution Agent for the Monad Blockchain",
  skills: [
    "generate_contract",
    "run_audit",
    "deploy_contract",
    "verify_contract",
    "search_docs",
    "execute_action"
  ],
  pricing: {
    "generate_contract": { price: "0.5", token: "MON" },
    "run_audit": { price: "1.0", token: "MON" },
    "deploy_contract": { price: "2.0", token: "MON" },
    "verify_contract": { price: "0.2", token: "MON" },
    "search_docs": { price: "0.0", token: "MON" },
    "execute_action": { price: "0.5", token: "MON" }
  },
  permissions: [
    "fs_read",
    "fs_write",
    "network_deploy",
    "network_verify",
    "wallet_access"
  ],
  reputation: {
    score: 98,
    totalExecutions: 337,
    successRate: 100
  }
};

export const SKILL_PACKAGES: Record<string, any> = {
  "generate_contract": {
    skill: "generate_contract",
    version: "1.0.0",
    category: "generation",
    schema: {
      name: "generate_contract",
      version: "1.0.0",
      description: "Generates boilerplate smart contracts on Monad",
      inputs: {
        type: "object",
        properties: {
          name: { type: "string" },
          symbol: { type: "string" },
          domain: { type: "string", enum: ["erc20", "erc721", "staking", "marketplace", "dao", "amm"] }
        },
        required: ["name", "symbol", "domain"]
      },
      outputs: {
        type: "object",
        properties: {
          contracts: { type: "object" }
        }
      },
      pricing: { price: "0.5", token: "MON" },
      permissions: ["fs_write"]
    }
  },
  "run_audit": {
    skill: "run_audit",
    version: "1.0.0",
    category: "security",
    schema: {
      name: "run_audit",
      version: "1.0.0",
      description: "Performs AST and rule-based security audits on Solidity contracts",
      inputs: {
        type: "object",
        properties: {
          code: { type: "string" },
          filePath: { type: "string" }
        }
      },
      outputs: {
        type: "object",
        properties: {
          issues: { type: "array" },
          score: { type: "number" }
        }
      },
      pricing: { price: "1.0", token: "MON" },
      permissions: ["fs_read"]
    }
  },
  "deploy_contract": {
    skill: "deploy_contract",
    version: "1.0.0",
    category: "deployment",
    schema: {
      name: "deploy_contract",
      version: "1.0.0",
      description: "Compiles, deploys, and verifies Solidity contracts on Monad networks",
      inputs: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          privateKey: { type: "string" }
        }
      },
      outputs: {
        type: "object",
        properties: {
          contractAddress: { type: "string" },
          transactionHash: { type: "string" },
          gasUsed: { type: "string" }
        }
      },
      pricing: { price: "2.0", token: "MON" },
      permissions: ["network_deploy", "wallet_access"]
    }
  },
  "verify_contract": {
    skill: "verify_contract",
    version: "1.0.0",
    category: "verification",
    schema: {
      name: "verify_contract",
      version: "1.0.0",
      description: "Verifies deployed smart contracts on Monad Sourcify/block explorer",
      inputs: {
        type: "object",
        properties: {
          contractAddress: { type: "string" },
          sourceCode: { type: "string" }
        },
        required: ["contractAddress"]
      },
      outputs: {
        type: "object",
        properties: {
          status: { type: "string" },
          message: { type: "string" }
        }
      },
      pricing: { price: "0.2", token: "MON" },
      permissions: ["network_verify"]
    }
  },
  "search_docs": {
    skill: "search_docs",
    version: "1.0.0",
    category: "knowledge",
    schema: {
      name: "search_docs",
      version: "1.0.0",
      description: "Queries the local knowledge base for Monad development guidelines",
      inputs: {
        type: "object",
        properties: {
          query: { type: "string" }
        },
        required: ["query"]
      },
      outputs: {
        type: "object",
        properties: {
          matches: { type: "array" }
        }
      },
      pricing: { price: "0.0", token: "MON" },
      permissions: []
    }
  },
  "execute_action": {
    skill: "execute_action",
    version: "1.0.0",
    category: "execution",
    schema: {
      name: "execute_action",
      version: "1.0.0",
      description: "Executes an action (mint, transfer, swap, stake) on a deployed Monad contract",
      inputs: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["mint", "transfer", "swap", "stake"] },
          contractAddress: { type: "string" },
          to: { type: "string" },
          amount: { type: "string" }
        },
        required: ["action", "contractAddress"]
      },
      outputs: {
        type: "object",
        properties: {
          status: { type: "string" },
          transactionHash: { type: "string" }
        }
      },
      pricing: { price: "0.5", token: "MON" },
      permissions: ["wallet_access"]
    }
  }
};

export class AgentIdentity {
  public static getManifest(): any {
    return AgentManifestSchema.parse(DEFAULT_MANIFEST);
  }

  public static getSkillPackages(): any[] {
    return Object.values(SKILL_PACKAGES).map(pkg => SkillPackageSchema.parse(pkg));
  }

  public static getSkillPackage(skillName: string): any {
    const pkg = SKILL_PACKAGES[skillName];
    if (!pkg) {
      throw new Error(`Skill package not found: ${skillName}`);
    }
    return SkillPackageSchema.parse(pkg);
  }
}
