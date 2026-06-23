import { getConfig } from "./config";
import { createLogger } from "./logging";

const logger = createLogger("Qdrant");

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, any>;
}

// In-Memory Mock Store for Local Fallback / Testing
interface MockStore {
  collections: Map<string, QdrantPoint[]>;
}

const mockStore: MockStore = {
  collections: new Map(),
};

// Calculate cosine similarity for mock search
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class QdrantClient {
  private url: string;
  private apiKey: string;
  private isMock: boolean;

  constructor() {
    const config = getConfig();
    this.url = config.QDRANT_URL;
    this.apiKey = config.QDRANT_API_KEY;
    this.isMock = config.QDRANT_MOCK;

    if (this.isMock) {
      logger.info("Qdrant Client is running in MOCK mode (local fallback)");
    } else {
      logger.info(`Qdrant Client initialized at ${this.url}`);
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["api-key"] = this.apiKey;
    }
    return headers;
  }

  public async createCollection(
    collectionName: string,
    vectorSize: number = 1536,
  ): Promise<boolean> {
    logger.info(`Creating collection ${collectionName}`, {
      operation: "createCollection",
    });

    if (this.isMock) {
      if (!mockStore.collections.has(collectionName)) {
        mockStore.collections.set(collectionName, []);
      }
      return true;
    }

    try {
      const response = await fetch(
        `${this.url}/collections/${collectionName}`,
        {
          method: "PUT",
          headers: this.getHeaders(),
          body: JSON.stringify({
            vectors: {
              size: vectorSize,
              distance: "Cosine",
            },
          }),
        },
      );

      if (!response.ok && response.status !== 409) {
        const text = await response.text();
        throw new Error(`Failed to create collection: ${text}`);
      }
      return true;
    } catch (error: any) {
      logger.error(`Error creating Qdrant collection ${collectionName}`, error);
      throw error;
    }
  }

  public async deleteCollection(collectionName: string): Promise<boolean> {
    logger.info(`Deleting collection ${collectionName}`, {
      operation: "deleteCollection",
    });

    if (this.isMock) {
      mockStore.collections.delete(collectionName);
      return true;
    }

    try {
      const response = await fetch(
        `${this.url}/collections/${collectionName}`,
        {
          method: "DELETE",
          headers: this.getHeaders(),
        },
      );

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new Error(`Failed to delete collection: ${text}`);
      }
      return true;
    } catch (error: any) {
      logger.error(`Error deleting Qdrant collection ${collectionName}`, error);
      throw error;
    }
  }

  public async upsert(
    collectionName: string,
    points: QdrantPoint[],
  ): Promise<boolean> {
    logger.info(
      `Upserting ${points.length} points to collection ${collectionName}`,
      { operation: "upsert" },
    );

    if (this.isMock) {
      const existing = mockStore.collections.get(collectionName) || [];
      const updatedMap = new Map<string | number, QdrantPoint>();
      for (const p of existing) updatedMap.set(p.id, p);
      for (const p of points) updatedMap.set(p.id, p);
      mockStore.collections.set(
        collectionName,
        Array.from(updatedMap.values()),
      );
      return true;
    }

    try {
      const response = await fetch(
        `${this.url}/collections/${collectionName}/points?wait=true`,
        {
          method: "PUT",
          headers: this.getHeaders(),
          body: JSON.stringify({ points }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to upsert points: ${text}`);
      }
      return true;
    } catch (error: any) {
      logger.error(`Error upserting points to ${collectionName}`, error);
      throw error;
    }
  }

  public async search(
    collectionName: string,
    vector: number[],
    limit: number = 5,
  ): Promise<any[]> {
    logger.info(`Searching collection ${collectionName}`, {
      operation: "search",
    });

    if (this.isMock) {
      const points = mockStore.collections.get(collectionName) || [];
      const scored = points.map((p) => {
        const score = cosineSimilarity(vector, p.vector);
        return {
          id: p.id,
          score,
          payload: p.payload || {},
        };
      });
      // Sort desc by score
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    }

    try {
      const response = await fetch(
        `${this.url}/collections/${collectionName}/points/search`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            vector,
            limit,
            with_payload: true,
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to search points: ${text}`);
      }

      const body = await response.json();
      return body.result || [];
    } catch (error: any) {
      logger.error(`Error searching points in ${collectionName}`, error);
      throw error;
    }
  }
}

let clientInstance: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!clientInstance) {
    clientInstance = new QdrantClient();
  }
  return clientInstance;
}

export function resetQdrantClientForTesting(): void {
  clientInstance = null;
  mockStore.collections.clear();
}
