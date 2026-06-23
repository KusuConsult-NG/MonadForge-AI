import { KnowledgeEngine } from "../src/index";
import { resetQdrantClientForTesting } from "@monadforge/sdk";

describe("KnowledgeEngine Unit Tests", () => {
  let engine: KnowledgeEngine;

  beforeEach(() => {
    resetQdrantClientForTesting();
    engine = new KnowledgeEngine();
  });

  it("should ingest documents and search them successfully", async () => {
    const docs = [
      {
        title: "Monad Consensus",
        source: "docs/consensus.md",
        content:
          "Monad employs a high-performance consensus algorithm called MonadBFT.",
      },
      {
        title: "Solidity Compiler",
        source: "docs/solc.md",
        content:
          "The solidity compiler converts smart contracts into EVM bytecode.",
      },
    ];

    await engine.ingestDocs(docs);

    // Search query similar to the first document
    const result = await engine.search("Consensus algorithm MonadBFT");
    expect(result.topMatches.length).toBeGreaterThan(0);
    expect(result.topMatches[0].title).toBe("Monad Consensus");
    expect(result.topMatches[0].source).toBe("docs/consensus.md");
    expect(result.confidenceScore).toBeGreaterThan(0.5);
    expect(result.sourceDocuments).toContain("docs/consensus.md");
  });

  it("should handle search with empty database gracefully", async () => {
    const result = await engine.search("arbitrary query");
    expect(result.topMatches.length).toBe(0);
    expect(result.confidenceScore).toBe(0.0);
    expect(result.sourceDocuments.length).toBe(0);
  });

  it("should handle empty or special character query in generateMockEmbedding", async () => {
    const result = await engine.search(" !!! ");
    expect(result.topMatches.length).toBe(0);
  });

  it("should propagate search errors", async () => {
    const { getQdrantClient } = require("@monadforge/sdk");
    const qdrant = getQdrantClient();
    const spy = jest
      .spyOn(qdrant, "search")
      .mockRejectedValueOnce(new Error("Qdrant Search Error"));

    await expect(engine.search("some query")).rejects.toThrow(
      "Qdrant Search Error",
    );
    spy.mockRestore();
  });

  it("should propagate ingestion errors", async () => {
    const { getQdrantClient } = require("@monadforge/sdk");
    const qdrant = getQdrantClient();
    const spy = jest
      .spyOn(qdrant, "upsert")
      .mockRejectedValueOnce(new Error("Qdrant Ingest Error"));

    await expect(
      engine.ingestDocs([{ title: "t", source: "s", content: "c" }]),
    ).rejects.toThrow("Qdrant Ingest Error");
    spy.mockRestore();
  });

  it("should handle search matches with missing payload fields", async () => {
    const { getQdrantClient } = require("@monadforge/sdk");
    const qdrant = getQdrantClient();
    const spy = jest.spyOn(qdrant, "search").mockResolvedValueOnce([
      {
        id: "p-1",
        score: 0.8,
        payload: {},
      },
    ]);

    const result = await engine.search("query");
    expect(result.topMatches[0].title).toBe("");
    expect(result.topMatches[0].source).toBe("");
    expect(result.topMatches[0].content).toBe("");
    spy.mockRestore();
  });

  it("should recommend patterns based on topics", async () => {
    const patternsStaking = await engine.recommendPatterns("staking yield");
    expect(patternsStaking).toContain("Monad FastPath Reward Calculator");

    const patternsDex = await engine.recommendPatterns("dex swap");
    expect(patternsDex).toContain("Constant Product AMM");

    const defaultPatterns = await engine.recommendPatterns("random topic");
    expect(defaultPatterns).toContain("Checks-Effects-Interactions");
  });

  it("should recommend architecture based on topics", async () => {
    const archStaking = await engine.recommendArchitecture("staking");
    expect(archStaking).toContain("segregated reward vaults");

    const archDex = await engine.recommendArchitecture("dex");
    expect(archDex).toContain("parallelized execution safety");

    const archDefault = await engine.recommendArchitecture("other");
    expect(archDefault).toContain("Standard Monad");
  });

  it("should recommend libraries", async () => {
    const libs = await engine.recommendLibraries("any topic");
    expect(libs).toContain("@openzeppelin/contracts");
  });

  it("should recommend contracts based on topics", async () => {
    const contractsStaking = await engine.recommendContracts("staking");
    expect(contractsStaking).toContain("SimpleStaking.sol");

    const contractsDex = await engine.recommendContracts("dex");
    expect(contractsDex).toContain("VibeAMM.sol");

    const contractsNft = await engine.recommendContracts("nft");
    expect(contractsNft).toContain("VibeNFT.sol");

    const defaultContracts = await engine.recommendContracts("other");
    expect(defaultContracts).toContain("VibeToken.sol");
  });

  it("should recommend project structure", async () => {
    const structure = await engine.recommendProjectStructure("any topic");
    expect(structure["contracts/"]).toBeDefined();
  });

  it("should auto-seed documentation offline in non-test env", async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "development";
    try {
      const result = await engine.search("testnet");
      expect(result.topMatches.length).toBeGreaterThan(0);
      expect(result.topMatches[0].title).toContain("Testnet");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
