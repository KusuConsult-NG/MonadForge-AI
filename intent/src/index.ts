import { createLogger } from "@monadforge/sdk";

const logger = createLogger("IntentEngine");

export interface StructuredIntent {
  type: "generate" | "deploy" | "audit" | "verify" | "docs" | "action";
  domain:
    | "erc20"
    | "erc721"
    | "erc1155"
    | "staking"
    | "dao"
    | "amm"
    | "unknown";
  params: Record<string, any>;
  constraints: string[];
}

export class IntentEngine {
  public async parse(prompt: string): Promise<StructuredIntent> {
    logger.info(`Parsing intent from prompt: "${prompt}"`, {
      operation: "parse",
    });
    const normalized = prompt.toLowerCase();

    let type: StructuredIntent["type"] = "docs";
    let domain: StructuredIntent["domain"] = "unknown";
    const params: Record<string, any> = {};
    const constraints: string[] = [];

    // Helper: extract addresses
    const addressMatch = prompt.match(/0x[a-fA-F0-9]{40}/);
    if (addressMatch) {
      params.contractAddress = addressMatch[0];
    }

    // Helper: extract projectId
    const projectMatch = prompt.match(
      /(?:project|contract)\s+([a-zA-Z0-9\-_]+)/i,
    );
    if (projectMatch) {
      params.projectId = projectMatch[1];
    }

    // Helper: extract numbers (like amount, supply)
    const numberMatch = prompt.match(/\b\d+(\.\d+)?\b/g);

    // 1. Classify Type & Domain
    if (normalized.includes("mint")) {
      type = "action";
      domain = "erc20"; // default mint is erc20 or erc721
      params.action = "mint";
      const toMatch = prompt.match(/(?:to|address)\s+(0x[a-fA-F0-9]{40})/i);
      if (toMatch) {
        params.to = toMatch[1];
      }
      if (numberMatch && numberMatch.length > 0) {
        params.amount = numberMatch[0];
      }
    } else if (normalized.includes("stake")) {
      type = "action";
      domain = "staking";
      params.action = "stake";
      if (numberMatch && numberMatch.length > 0) {
        params.amount = numberMatch[0];
      }
    } else if (normalized.includes("swap")) {
      type = "action";
      domain = "amm";
      params.action = "swap";
      const tokenMatch = prompt.match(/token\s+(0x[a-fA-F0-9]{40})/i);
      if (tokenMatch) {
        params.tokenIn = tokenMatch[1];
      }
      if (numberMatch && numberMatch.length > 0) {
        params.amountIn = numberMatch[0];
      }
    } else if (normalized.includes("transfer") || normalized.includes("send")) {
      type = "action";
      params.action = "transfer";
      const toMatch = prompt.match(/(?:to|address)\s+(0x[a-fA-F0-9]{40})/i);
      if (toMatch) {
        params.to = toMatch[1];
      }
      if (numberMatch && numberMatch.length > 0) {
        params.amount = numberMatch[0];
      }
    } else if (normalized.includes("deploy")) {
      type = "deploy";
      if (!params.projectId) {
        params.projectId = "default-project";
      }
    } else if (normalized.includes("audit")) {
      type = "audit";
      const fileMatch = prompt.match(
        /(?:file|path|at)\s+([a-zA-Z0-9\-_/.]+\.sol)/i,
      );
      if (fileMatch) {
        params.filePath = fileMatch[1];
      } else {
        params.filePath = "contracts/Token.sol";
      }
    } else if (normalized.includes("verify")) {
      type = "verify";
      const fileMatch = prompt.match(
        /(?:file|path|at)\s+([a-zA-Z0-9\-_/.]+\.sol)/i,
      );
      if (fileMatch) {
        params.filePath = fileMatch[1];
      }
    } else if (
      normalized.includes("generate") ||
      normalized.includes("create") ||
      normalized.includes("build")
    ) {
      type = "generate";

      // Determine domain
      if (
        normalized.includes("erc20") ||
        normalized.includes("erc-20") ||
        normalized.includes("token")
      ) {
        domain = "erc20";
      } else if (
        normalized.includes("erc721") ||
        normalized.includes("erc-721") ||
        normalized.includes("nft")
      ) {
        domain = "erc721";
      } else if (
        normalized.includes("erc1155") ||
        normalized.includes("erc-1155") ||
        normalized.includes("multitoken")
      ) {
        domain = "erc1155";
      } else if (normalized.includes("staking")) {
        domain = "staking";
      } else if (normalized.includes("dao")) {
        domain = "dao";
      } else if (
        normalized.includes("amm") ||
        normalized.includes("liquidity") ||
        normalized.includes("swap")
      ) {
        domain = "amm";
      }

      // Name & Symbol extraction
      const nameMatch = prompt.match(/(?:named?|called)\s+([a-zA-Z0-9\-_]+)/i);
      if (nameMatch) {
        params.name = nameMatch[1];
      } else {
        params.name =
          domain !== "unknown" ? domain.toUpperCase() + "Token" : "ForgeToken";
      }

      const symbolMatch = prompt.match(/(?:symbol)\s+([a-zA-Z0-9\-_]+)/i);
      if (symbolMatch) {
        params.symbol = symbolMatch[1];
      } else {
        params.symbol = "FORGE";
      }

      if (numberMatch && numberMatch.length > 0) {
        params.supply = numberMatch[0];
      }
    } else {
      type = "docs";
      params.query = prompt;
    }

    return {
      type,
      domain,
      params,
      constraints,
    };
  }
}
