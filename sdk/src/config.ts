import * as dotenv from "dotenv";
import * as path from "path";
import { z } from "zod";

// Load env files
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config(); // fallback to process.cwd() .env

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])
    .default("INFO"),

  // PostgreSQL (kept for compatibility, though database is removed)
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default("mac"),
  DB_PASSWORD: z.string().default(""),
  DB_DATABASE: z.string().default("monadforge"),

  // Qdrant Vector DB
  QDRANT_MOCK: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .default(true),
  QDRANT_URL: z.string().default("http://localhost:6333"),
  QDRANT_API_KEY: z.string().default(""),

  // Monad Network
  MONAD_RPC_URL: z.string().default("https://testnet-rpc.monad.xyz"),
  MONAD_RPC_URL_FALLBACK: z.string().default("https://rpc-devnet.monad.xyz"),
  DEPLOYER_PRIVATE_KEY: z
    .string()
    .default(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ),

  // Server Ports
  API_PORT: z.coerce.number().default(3000),
  MCP_PORT: z.coerce.number().default(4000),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  try {
    const parsed = configSchema.parse(process.env);
    cachedConfig = parsed;
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      throw new Error(`Configuration validation failed: ${issues}`);
    }
    throw error;
  }
}

export function resetConfigForTesting(): void {
  cachedConfig = null;
}
