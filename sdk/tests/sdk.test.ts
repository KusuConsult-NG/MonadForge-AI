import {
  getConfig,
  resetConfigForTesting,
  createLogger,
  logContextStorage,
  getQdrantClient,
  resetQdrantClientForTesting,
} from "../src";
import { Logger } from "../src/logging";
import { QdrantClient } from "../src/qdrant";

describe("SDK Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfigForTesting();
    resetQdrantClientForTesting();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Config Engine", () => {
    it("should load default configuration", () => {
      const config = getConfig();
      expect(config.NODE_ENV).toBe("test"); // set by jest
      expect(config.LOG_LEVEL).toBe("INFO");
      expect(config.DB_HOST).toBe("localhost");
      expect(config.QDRANT_MOCK).toBe(true);
    });

    it("should use custom environment variables", () => {
      process.env.LOG_LEVEL = "DEBUG";
      process.env.DB_PORT = "9999";
      process.env.QDRANT_MOCK = "false";

      const config = getConfig();
      expect(config.LOG_LEVEL).toBe("DEBUG");
      expect(config.DB_PORT).toBe(9999);
      expect(config.QDRANT_MOCK).toBe(false);
    });

    it("should throw validation error on invalid configuration", () => {
      process.env.LOG_LEVEL = "INVALID_LEVEL";
      expect(() => getConfig()).toThrow("Configuration validation failed");
    });

    it("should throw error when non-zod error occurs during parsing", () => {
      Object.defineProperty(process.env, "DB_PORT", {
        get() {
          throw new Error("Some generic error");
        },
        configurable: true,
      });

      try {
        expect(() => getConfig()).toThrow("Some generic error");
      } finally {
        delete (process.env as any).DB_PORT;
      }
    });

    it("should cache configuration", () => {
      const config1 = getConfig();
      process.env.LOG_LEVEL = "DEBUG"; // would change if re-parsed
      const config2 = getConfig();
      expect(config1).toBe(config2);
      expect(config2.LOG_LEVEL).toBe("INFO"); // cached value
    });
  });

  describe("Logging Engine", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should fallback to default level if LOG_LEVEL is not set", () => {
      delete process.env.LOG_LEVEL;
      resetConfigForTesting();
      const logger = createLogger("TestModule");
      logger.info("Info message");
      expect(logSpy).toHaveBeenCalled();
    });

    it("should log messages with appropriate severity", () => {
      const logger = createLogger("TestModule");
      logger.info("Info message");
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.message).toBe("Info message");
      expect(payload.severity).toBe("INFO");
      expect(payload.module).toBe("TestModule");
      expect(payload.timestamp).toBeDefined();
    });

    it("should output errors to console.error", () => {
      const logger = createLogger("TestModule");
      logger.error("Error message", new Error("Fail"));
      expect(errorSpy).toHaveBeenCalled();
      const payload = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(payload.message).toBe("Error message");
      expect(payload.severity).toBe("ERROR");
      expect(payload.error.message).toBe("Fail");
      expect(payload.error.stack).toBeDefined();
    });

    it("should log critical errors to console.error", () => {
      const logger = createLogger("TestModule");
      logger.critical("Critical message", { custom: "err" });
      expect(errorSpy).toHaveBeenCalled();
      const payload = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(payload.message).toBe("Critical message");
      expect(payload.severity).toBe("CRITICAL");
      expect(payload.error.custom).toBe("err");
    });

    it("should support warn and debug levels", () => {
      process.env.LOG_LEVEL = "DEBUG";
      resetConfigForTesting();

      const logger = createLogger("TestModule");
      logger.debug("Debug message");
      logger.warn("Warn message");

      expect(logSpy).toHaveBeenCalledTimes(2);
      const debugPayload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(debugPayload.severity).toBe("DEBUG");
      const warnPayload = JSON.parse(logSpy.mock.calls[1][0]);
      expect(warnPayload.severity).toBe("WARNING");
    });

    it("should filter logs below min severity", () => {
      process.env.LOG_LEVEL = "WARNING";
      resetConfigForTesting();

      const logger = createLogger("TestModule");
      logger.debug("Debug message");
      logger.info("Info message");

      expect(logSpy).not.toHaveBeenCalled();
    });

    it("should inject log context from AsyncLocalStorage", () => {
      const logger = createLogger("TestModule");
      logContextStorage.run(
        {
          requestId: "req-123",
          projectId: "proj-456",
          module: "ContextModule",
        },
        () => {
          logger.info("Context log", {
            operation: "op",
            duration: 100,
            status: "success",
          });
        },
      );

      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.module).toBe("ContextModule");
      expect(payload.requestId).toBe("req-123");
      expect(payload.projectId).toBe("proj-456");
      expect(payload.operation).toBe("op");
      expect(payload.duration).toBe(100);
      expect(payload.status).toBe("success");
    });

    it("should fallback to default level if invalid level in env", () => {
      process.env.LOG_LEVEL = "UNKNOWN" as any;
      // getMinLogLevel handles this by checking record keys, fallback is 1 (INFO)
      const logger = createLogger("TestModule");
      logger.debug("Debug message"); // level 0, shouldn't log
      logger.info("Info message"); // level 1, should log
      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.severity).toBe("INFO");
    });
  });

  describe("Qdrant Engine (Mock Mode)", () => {
    it("should initialize and perform CRUD in mock mode", async () => {
      const client = getQdrantClient();
      expect(client).toBeDefined();

      const created = await client.createCollection("test-collection", 3);
      expect(created).toBe(true);

      const upserted = await client.upsert("test-collection", [
        { id: 1, vector: [1, 0, 0], payload: { text: "one" } },
        { id: 2, vector: [0, 1, 0], payload: { text: "two" } },
        { id: "three", vector: [0, 0, 1], payload: { text: "three" } },
      ]);
      expect(upserted).toBe(true);

      // Cosine similarity search
      const results = await client.search("test-collection", [1, 0.1, 0], 2);
      expect(results.length).toBe(2);
      expect(results[0].id).toBe(1); // closest
      expect(results[0].score).toBeGreaterThan(0.9);
      expect(results[0].payload.text).toBe("one");

      // Test deleting collection
      const deleted = await client.deleteCollection("test-collection");
      expect(deleted).toBe(true);

      const emptyResults = await client.search("test-collection", [1, 0, 0], 5);
      expect(emptyResults.length).toBe(0);
    });

    it("should return 0 similarity if vectors have different lengths", async () => {
      const client = getQdrantClient();
      await client.createCollection("test-collection", 3);
      await client.upsert("test-collection", [
        { id: 1, vector: [1, 0], payload: { text: "bad-dim" } },
      ]);
      const results = await client.search("test-collection", [1, 0, 0], 1);
      expect(results[0].score).toBe(0);
    });

    it("should return 0 similarity if vectors are zero vectors", async () => {
      const client = getQdrantClient();
      await client.createCollection("test-collection", 3);
      await client.upsert("test-collection", [{ id: 1, vector: [0, 0, 0] }]);
      const results = await client.search("test-collection", [1, 0, 0], 1);
      expect(results[0].score).toBe(0);
    });

    it("should upsert to a non-existent collection in mock mode", async () => {
      const client = getQdrantClient();
      const upserted = await client.upsert("non-existent-col", [
        { id: 1, vector: [1, 0, 0] },
      ]);
      expect(upserted).toBe(true);
      const results = await client.search("non-existent-col", [1, 0, 0], 1);
      expect(results.length).toBe(1);
    });
  });

  describe("Qdrant Engine (Real Mode)", () => {
    let originalFetch: any;

    beforeEach(() => {
      process.env.QDRANT_MOCK = "false";
      process.env.QDRANT_URL = "http://test-qdrant:6333";
      process.env.QDRANT_API_KEY = "test-key";
      resetConfigForTesting();
      resetQdrantClientForTesting();
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("should call fetch on createCollection", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const result = await client.createCollection("test-collection", 128);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://test-qdrant:6333/collections/test-collection",
        expect.objectContaining({
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "api-key": "test-key",
          },
          body: JSON.stringify({
            vectors: {
              size: 128,
              distance: "Cosine",
            },
          }),
        }),
      );
    });

    it("should ignore 409 status on createCollection", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const result = await client.createCollection("test-collection");
      expect(result).toBe(true);
    });

    it("should throw error on createCollection failure", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      await expect(client.createCollection("test-collection")).rejects.toThrow(
        "Failed to create collection: Internal server error",
      );
    });

    it("should call fetch on deleteCollection", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const result = await client.deleteCollection("test-collection");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://test-qdrant:6333/collections/test-collection",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });

    it("should ignore 404 status on deleteCollection", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const result = await client.deleteCollection("test-collection");
      expect(result).toBe(true);
    });

    it("should throw error on deleteCollection failure", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Database error",
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      await expect(client.deleteCollection("test-collection")).rejects.toThrow(
        "Failed to delete collection: Database error",
      );
    });

    it("should call fetch on upsert", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const points = [{ id: 1, vector: [0.1, 0.2] }];
      const result = await client.upsert("test-collection", points);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://test-qdrant:6333/collections/test-collection/points?wait=true",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ points }),
        }),
      );
    });

    it("should throw error on upsert failure", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Invalid payload",
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      await expect(client.upsert("test-collection", [])).rejects.toThrow(
        "Failed to upsert points: Invalid payload",
      );
    });

    it("should call fetch on search", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: [{ id: 1, score: 0.99 }] }),
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const results = await client.search("test-collection", [0.1, 0.2], 10);

      expect(results).toEqual([{ id: 1, score: 0.99 }]);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://test-qdrant:6333/collections/test-collection/points/search",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            vector: [0.1, 0.2],
            limit: 10,
            with_payload: true,
          }),
        }),
      );
    });

    it("should throw error on search failure", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Search failed",
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      await expect(client.search("test-collection", [0.1])).rejects.toThrow(
        "Failed to search points: Search failed",
      );
    });

    it("should return empty array on search when result is undefined", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}), // no result field
      });
      global.fetch = mockFetch;

      const client = getQdrantClient();
      const results = await client.search("test-collection", [0.1, 0.2], 10);
      expect(results).toEqual([]);
    });
  });
});
