import { Command } from "commander";
import {
  createLogger,
  getConfig,
  resetConfigForTesting,
} from "@monadforge/sdk";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { monadforge } from "@monadforge/ai";
import { ActionLayer } from "@monadforge/actions";

const logger = createLogger("CLI");
const program = new Command();

program
  .name("monadforge")
  .description("AI-native developer toolkit for Monad")
  .version("1.0.0");

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const cleaned = answer.trim().toLowerCase();
      resolve(cleaned === "y" || cleaned === "yes");
    });
  });
}

export function askQuestion(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const cleaned = answer.trim();
      resolve(cleaned || defaultValue || "");
    });
  });
}

export function askSelection(
  question: string,
  options: string[],
  defaultOption: string,
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const optionsStr = options.join("/");
    const promptText = `${question} (${optionsStr}) [${defaultOption}]: `;
    rl.question(promptText, (answer) => {
      rl.close();
      const cleaned = answer.trim().toLowerCase();
      if (!cleaned) {
        resolve(defaultOption);
      } else if (options.includes(cleaned)) {
        resolve(cleaned);
      } else {
        console.log(
          `Invalid option "${cleaned}". Defaulting to "${defaultOption}".`,
        );
        resolve(defaultOption);
      }
    });
  });
}

// 1. Init Command
program
  .command("init")
  .description("Initialize a new MonadForge AI project directory")
  .option("-n, --name <name>", "Project name", "monad-project")
  .option("-i, --interactive", "Interactive configuration helper")
  .action(async (options) => {
    logger.info("Running init command", { operation: "init" });
    try {
      let projectName = options.name;
      let contractsDir = "contracts";
      let testDir = "test";
      let scriptsDir = "scripts";

      if (options.interactive) {
        projectName = await askQuestion(
          "Enter project name (default: monad-project): ",
          "monad-project",
        );
        contractsDir = await askQuestion(
          "Enter contracts directory name (default: contracts): ",
          "contracts",
        );
        testDir = await askQuestion(
          "Enter test directory name (default: test): ",
          "test",
        );
        scriptsDir = await askQuestion(
          "Enter scripts directory name (default: scripts): ",
          "scripts",
        );
      }

      console.log(`Initializing MonadForge AI project "${projectName}"...`);
      await monadforge.tools.createProject({
        name: projectName,
        contractsDir,
        testDir,
        scriptsDir,
      });
      console.log("Project initialized successfully.");
    } catch (err: any) {
      logger.error("Init command failed", err);
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// 2. Build Command
program
  .command("build")
  .description("Compile project Solidity contracts")
  .action(async () => {
    logger.info("Running build command", { operation: "build" });
    try {
      const configPath = path.resolve(process.cwd(), "monadforge.json");
      if (!fs.existsSync(configPath)) {
        throw new Error(
          "Project not initialized. Please run 'monadforge init' first.",
        );
      }
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const contractsDirName = config.contractsDir || "contracts";
      const contractsDir = path.resolve(process.cwd(), contractsDirName);
      const projectFiles: Record<string, string> = {};

      if (fs.existsSync(contractsDir)) {
        const files = fs.readdirSync(contractsDir);
        for (const file of files) {
          if (file.endsWith(".sol")) {
            projectFiles[path.join(contractsDirName, file)] = fs.readFileSync(
              path.join(contractsDir, file),
              "utf8",
            );
          }
        }
      }

      if (Object.keys(projectFiles).length === 0) {
        projectFiles[path.join(contractsDirName, "Token.sol")] =
          "pragma solidity ^0.8.20; contract Token {}";
      }

      console.log("Compiling smart contracts...");
      const actionLayer = new ActionLayer();
      const result = await actionLayer.compile(projectFiles);
      if (result.status === "success") {
        console.log("Compilation successful.");
      } else {
        throw new Error(`Compilation failed: ${result.metadata.errors?.join(", ")}`);
      }
    } catch (err: any) {
      logger.error("Build command failed", err);
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// 3. Continue Command
program
  .command("continue [projectId]")
  .description("Resume previous execution using memory context")
  .option("-p, --prompt <prompt>", "Action/Goal prompt")
  .action(async (projectIdArg, options) => {
    logger.info("Running continue command", { operation: "continue" });
    try {
      const prompt = options.prompt || "continue";
      const configPath = path.resolve(process.cwd(), "monadforge.json");
      let configName = "ForgeToken";
      if (fs.existsSync(configPath)) {
        try {
          const loaded = JSON.parse(fs.readFileSync(configPath, "utf8"));
          configName = loaded.name || configName;
        } catch (e) {}
      }
      const projectId = projectIdArg || configName.toLowerCase() + "-project";

      console.log(`Resuming project execution for project ${projectId}...`);
      const result = await monadforge.engine.continue({ projectId, prompt });
      if (result.success) {
        console.log("Execution resumed successfully.");
        console.log(result.message);
      } else {
        throw new Error(result.message || "Failed to continue execution");
      }
    } catch (err: any) {
      logger.error("Continue command failed", err);
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// 4. Audit Command
program
  .command("audit <filePath>")
  .description("Run static analysis security audit on contract file")
  .action(async (filePath) => {
    logger.info("Running audit command", { operation: "audit" });
    try {
      console.log(`Auditing smart contract at ${filePath}...`);
      const fullPath = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const contractSource = fs.readFileSync(fullPath, "utf8");
      const report = await monadforge.tools.audit(contractSource);

      console.log("\n--- SECURITY AUDIT REPORT ---");
      console.log(`Risk Score: ${report.riskScore}/100`);
      console.log(`Issues found: ${report.issues.length}`);
      report.issues.forEach((issue: any) => {
        console.log(
          `- [${issue.severity}] ${issue.title}: ${issue.description}`,
        );
      });
      console.log("----------------------------\n");
    } catch (err: any) {
      logger.error("Audit command failed", err);
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// 5. Deploy Command
program
  .command("deploy [projectId]")
  .description("Compile and deploy contract to Monad Testnet")
  .option("-n, --network <network>", "Network target", "monad-testnet")
  .option("-y, --yes", "Automatic confirmation to deploy")
  .option("-i, --interactive", "Interactive configuration helper")
  .action(async (projectIdArg, options) => {
    logger.info("Running deploy command", { operation: "deploy" });
    try {
      let network = options.network || "monad-testnet";
      let privateKey =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      try {
        const config = getConfig();
        privateKey = config.DEPLOYER_PRIVATE_KEY;
      } catch (e) {}

      if (options.interactive) {
        network = await askSelection(
          "Select target network",
          ["monad-testnet", "local"],
          "monad-testnet",
        );
        if (
          privateKey ===
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        ) {
          const inputKey = await askQuestion(
            "Enter deployer private key (0x...): ",
          );
          if (inputKey) {
            process.env.DEPLOYER_PRIVATE_KEY = inputKey;
            resetConfigForTesting();
            privateKey = inputKey;
          }
        }
      }

      if (network !== "monad-testnet" && network !== "local") {
        throw new Error("Mainnet deployment is disabled in Version 1.");
      }

      let configName = "ForgeToken";
      let contractsDirName = "contracts";
      try {
        const configPath = path.resolve(process.cwd(), "monadforge.json");
        if (fs.existsSync(configPath)) {
          const loaded = JSON.parse(fs.readFileSync(configPath, "utf8"));
          configName = loaded.name || configName;
          contractsDirName = loaded.contractsDir || contractsDirName;
        }
      } catch (e) {}

      const projectId = projectIdArg || configName.toLowerCase() + "-project";

      const contracts: Record<string, string> = {};
      const contractsDir = path.resolve(process.cwd(), contractsDirName);
      try {
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
      } catch (e) {}

      if (Object.keys(contracts).length === 0) {
        contracts[path.join(contractsDirName, "Token.sol")] =
          "pragma solidity ^0.8.20; contract Token {}";
      }

      console.log("Running pre-deployment security scan...");
      let hasSecurityBlock = false;
      const scanResults: any[] = [];

      for (const filePath of Object.keys(contracts)) {
        const code = contracts[filePath];
        const report = await monadforge.tools.audit(code);
        scanResults.push({ filePath, report });
        if (
          report.issues.some(
            (issue: any) =>
              issue.severity === "Critical" || issue.severity === "High",
          )
        ) {
          hasSecurityBlock = true;
        }
      }

      console.log("\n--- SECURITY AUDIT SCAN ---");
      for (const res of scanResults) {
        console.log(`File: ${res.filePath}`);
        console.log(`Risk Score: ${res.report.riskScore}/100`);
        if (res.report.issues.length > 0) {
          console.log("Vulnerabilities found:");
          res.report.issues.forEach((issue: any) => {
            console.log(
              `- [${issue.severity}] ${issue.title}: ${issue.description}`,
            );
          });
        } else {
          console.log("No vulnerabilities detected.");
        }
      }
      console.log("---------------------------\n");

      if (hasSecurityBlock) {
        throw new Error(
          "Deployment blocked: critical or high severity security vulnerabilities detected.",
        );
      }

      const isTestEnv = process.env.NODE_ENV === "test";
      if (!options.yes && !isTestEnv) {
        const confirmed = await askConfirmation(
          `Do you want to proceed with deployment to ${network}? (y/N): `,
        );
        if (!confirmed) {
          console.log("Deployment aborted by user.");
          return;
        }
      }

      console.log("Compiling project contracts...");
      const actionLayer = new ActionLayer();
      const compResult = await actionLayer.compile(contracts);
      if (compResult.status === "failure") {
        throw new Error(`Compilation failed: ${compResult.metadata.errors?.join(", ")}`);
      }

      console.log(`Deploying compiled contract to ${network}...`);
      const deployResult = await monadforge.actions.deploy(compResult, network);

      const status = deployResult.status || "success";
      if (status !== "success") {
        throw new Error("Deployment failed");
      }

      const deploymentsDir = path.resolve(process.cwd(), ".monadforge");
      try {
        fs.mkdirSync(deploymentsDir, { recursive: true });
        const deploymentsPath = path.join(deploymentsDir, "deployments.json");
        let localDeployments: any[] = [];
        if (fs.existsSync(deploymentsPath)) {
          localDeployments = JSON.parse(
            fs.readFileSync(deploymentsPath, "utf8"),
          );
        }
        localDeployments.push({
          projectId,
          network,
          contractAddress: deployResult.metadata?.contractAddress || "",
          transactionHash: deployResult.metadata?.transactionHash || "",
          status,
          timestamp: new Date().toISOString(),
        });
        fs.writeFileSync(
          deploymentsPath,
          JSON.stringify(localDeployments, null, 2),
          "utf8",
        );
      } catch (e) {}

      console.log("\n--- DEPLOYMENT SUCCESSFUL ---");
      console.log(`Contract Address: ${deployResult.metadata?.contractAddress}`);
      console.log(`Transaction Hash: ${deployResult.metadata?.transactionHash}`);
      console.log(`Gas Used: ${deployResult.metadata?.gasUsed}`);
      if (deployResult.metadata?.verificationStatus) {
        console.log(`Verification: ${deployResult.metadata.verificationMessage}`);
      }
      console.log("-----------------------------\n");
    } catch (err: any) {
      logger.error("Deploy command failed", err);
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

/* istanbul ignore next */
if (require.main === module) {
  program.parse(process.argv);
}

export { program };
