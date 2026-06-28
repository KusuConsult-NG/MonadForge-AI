import {
  IKnowledgeEngine,
  SearchResult,
  DocSource,
  getQdrantClient,
  createLogger,
} from "@monadforge/sdk";

const logger = createLogger("KnowledgeEngine");
const COLLECTION_NAME = "documentation";

export class KnowledgeEngine implements IKnowledgeEngine {
  private qdrant = getQdrantClient();

  // Helper to generate a simple deterministic vector representation of text
  // for mock/local RAG operation without requiring external API keys.
  private generateMockEmbedding(text: string, size: number = 1536): number[] {
    const vector = new Array(size).fill(0);
    const cleanText = text.toLowerCase();

    // Hash terms into indexes (Bag of Words / Token hashing)
    const words = cleanText.split(/\W+/).filter(Boolean);
    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 31 + word.charCodeAt(i)) % size;
      }
      vector[hash] = (vector[hash] || 0) + 1.0;
    }

    // Normalize the vector (Cosine distance safety)
    let magnitude = 0;
    for (const v of vector) magnitude += v * v;
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < size; i++) {
        vector[i] /= magnitude;
      }
    } else {
      vector[0] = 1.0;
    }

    return vector;
  }

  public async search(query: string): Promise<SearchResult> {
    logger.info(`Searching documentation for query: "${query}"`, {
      operation: "search",
    });
    const queryVector = this.generateMockEmbedding(query);

    try {
      await this.qdrant.createCollection(COLLECTION_NAME);
      let matches = await this.qdrant.search(COLLECTION_NAME, queryVector, 5);

      // Auto-seed from local knowledge-base folder on-the-fly if mock database is empty
      if (
        (!matches || matches.length === 0) &&
        (this.qdrant as any).isMock &&
        process.env.NODE_ENV !== "test"
      ) {
        try {
          const fs = require("fs");
          const path = require("path");
          const kbDir = path.resolve(__dirname, "../../docs/knowledge-base");
          if (fs.existsSync(kbDir)) {
            const files = fs
              .readdirSync(kbDir)
              .filter((file: string) => file.endsWith(".md"));
            const docs: DocSource[] = [];
            for (const file of files) {
              const filePath = path.join(kbDir, file);
              const content = fs.readFileSync(filePath, "utf-8");
              const lines = content.split("\n");
              const title = lines[0]?.replace(/^#\s*/, "").trim() || file;
              docs.push({
                title,
                source: `docs/knowledge-base/${file}`,
                content,
              });
            }
            if (docs.length > 0) {
              await this.ingestDocs(docs);
              matches = await this.qdrant.search(
                COLLECTION_NAME,
                queryVector,
                5,
              );
            }
          }
        } catch (seedErr) {
          logger.warn(
            "Offline auto-seeding failed, continuing with empty search results",
            seedErr,
          );
        }
      }

      const formattedMatches = matches.map((m: any) => ({
        id: String(m.id),
        title: m.payload.title || "",
        source: m.payload.source || "",
        content: m.payload.content || "",
        score: m.score,
      }));

      // Calculate confidence as the maximum score of top matches (max 1.0)
      const confidenceScore =
        formattedMatches.length > 0 ? formattedMatches[0].score : 0.0;

      const sourceDocuments = Array.from(
        new Set(formattedMatches.map((m) => m.source)),
      );

      return {
        topMatches: formattedMatches,
        confidenceScore,
        sourceDocuments,
      };
    } catch (err: any) {
      logger.error("Documentation search failed", err);
      throw err;
    }
  }

  public async ingestDocs(docs: DocSource[]): Promise<void> {
    logger.info(`Ingesting ${docs.length} documentation assets`, {
      operation: "ingestDocs",
    });

    try {
      await this.qdrant.createCollection(COLLECTION_NAME);

      const points = docs.map((doc, idx) => {
        const id = `${doc.title.replace(/\s+/g, "-").toLowerCase()}-${idx}`;
        const vector = this.generateMockEmbedding(doc.content);
        return {
          id,
          vector,
          payload: {
            title: doc.title,
            source: doc.source,
            content: doc.content,
          },
        };
      });

      await this.qdrant.upsert(COLLECTION_NAME, points);
      logger.info("Documentation assets ingested successfully");
    } catch (err: any) {
      logger.error("Documentation ingestion failed", err);
      throw err;
    }
  }

  public async recommendPatterns(topic: string): Promise<string[]> {
    logger.info(`Recommending patterns for topic: "${topic}"`, {
      operation: "recommendPatterns",
    });
    const normalized = topic.toLowerCase();
    if (normalized.includes("staking") || normalized.includes("yield")) {
      return [
        "Monad FastPath Reward Calculator",
        "Checks-Effects-Interactions",
        "SafeERC20 Asset Pull",
      ];
    }
    if (
      normalized.includes("dex") ||
      normalized.includes("amm") ||
      normalized.includes("swap")
    ) {
      return [
        "Constant Product AMM",
        "Slippage Guard Check",
        "Flash Loan Reentrancy Shield",
      ];
    }
    return [
      "Checks-Effects-Interactions",
      "Ownable Design Modifier",
      "Safe Transfer Checks",
    ];
  }

  public async recommendArchitecture(topic: string): Promise<string> {
    logger.info(`Recommending architecture for topic: "${topic}"`, {
      operation: "recommendArchitecture",
    });
    const normalized = topic.toLowerCase();
    if (normalized.includes("staking") || normalized.includes("yield")) {
      return "Monad Parallel EVM Optimized Staking Contract Architecture with segregated reward vaults.";
    }
    if (
      normalized.includes("dex") ||
      normalized.includes("amm") ||
      normalized.includes("swap")
    ) {
      return "Multi-token Liquidity Pool Pool Factory with parallelized execution safety.";
    }
    return "Standard Monad Layer-1 Smart Contract Architecture.";
  }

  public async recommendLibraries(topic: string): Promise<string[]> {
    logger.info(`Recommending libraries for topic: "${topic}"`, {
      operation: "recommendLibraries",
    });
    return ["@openzeppelin/contracts", "solady", "@monadforge/sdk"];
  }

  public async recommendContracts(topic: string): Promise<string[]> {
    logger.info(`Recommending contracts for topic: "${topic}"`, {
      operation: "recommendContracts",
    });
    const normalized = topic.toLowerCase();
    if (normalized.includes("staking")) return ["SimpleStaking.sol"];
    if (normalized.includes("dex") || normalized.includes("amm"))
      return ["VibeAMM.sol", "DEXToken.sol"];
    if (normalized.includes("nft")) return ["VibeNFT.sol"];
    return ["VibeToken.sol"];
  }

  public async recommendProjectStructure(
    topic: string,
  ): Promise<Record<string, string>> {
    logger.info(`Recommending project structure for topic: "${topic}"`, {
      operation: "recommendProjectStructure",
    });
    return {
      "contracts/": "Smart contract files (.sol)",
      "scripts/": "Deployment and automation tasks",
      "test/": "Comprehensive unit and integration tests",
      "tsconfig.json": "TypeScript configuration details",
    };
  }
}
export default KnowledgeEngine;
