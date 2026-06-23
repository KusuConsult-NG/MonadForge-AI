import * as fs from "fs";
import * as path from "path";
import { KnowledgeEngine } from "../knowledge/src/index";
import { DocSource, createLogger } from "../sdk/src/index";

const logger = createLogger("SeedKnowledge");

async function seed() {
  logger.info("Starting knowledge seeding script...");
  const kbDir = path.resolve(__dirname, "../docs/knowledge-base");

  if (!fs.existsSync(kbDir)) {
    logger.error(`Knowledge base directory not found at ${kbDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(kbDir).filter((file) => file.endsWith(".md"));
  const docs: DocSource[] = [];

  for (const file of files) {
    const filePath = path.join(kbDir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract title from first line header (e.g. "# Title")
    const lines = content.split("\n");
    const firstLine = lines[0] || "";
    const title = firstLine.replace(/^#\s*/, "").trim() || file;

    docs.push({
      title,
      source: `docs/knowledge-base/${file}`,
      content,
    });

    logger.info(`Read document: "${title}" from ${file}`);
  }

  try {
    const knowledgeEngine = new KnowledgeEngine();
    await knowledgeEngine.ingestDocs(docs);
    logger.info(
      "Successfully seeded all knowledge base documentation into Qdrant collection!",
    );
  } catch (err: any) {
    logger.error("Failed to seed knowledge base", err);
    process.exit(1);
  }
}

if (require.main === module) {
  seed();
}
export { seed };
