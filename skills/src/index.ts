import { createLogger, GeneratedProject } from "@monadforge/sdk";
import { TemplateEngine } from "@monadforge/templates";
import { ActionLayer } from "@monadforge/actions";
import { AuditEngine } from "@monadforge/audit";
import { KnowledgeEngine } from "@monadforge/knowledge";

const logger = createLogger("AgentSkills");

export class AgentSkills {
  private templateEngine = new TemplateEngine();
  private actionLayer = new ActionLayer();
  private auditEngine = new AuditEngine();
  private knowledgeEngine = new KnowledgeEngine();

  public async route(
    skillName: string,
    params: Record<string, any>,
    context?: any,
  ): Promise<any> {
    logger.info(`Routing step to skill: ${skillName}`, { operation: "route" });

    switch (skillName) {
      case "generate_contract":
        return this.templateEngine.generateProject(
          params.name || "Token",
          params.symbol || "TKN",
          params.domain || "erc20",
          params,
        );
      case "run_audit":
        let codeToAudit = "";
        if (params.code) {
          codeToAudit = params.code;
        } else if (params.filePath) {
          const fs = require("fs");
          const path = require("path");
          const resolved = path.resolve(process.cwd(), params.filePath);
          if (fs.existsSync(resolved)) {
            codeToAudit = fs.readFileSync(resolved, "utf8");
          } else {
            throw new Error(`File not found for audit: ${params.filePath}`);
          }
        } else {
          const fs = require("fs");
          const path = require("path");
          const contractsDir = path.resolve(process.cwd(), "contracts");
          if (fs.existsSync(contractsDir)) {
            const files = fs
              .readdirSync(contractsDir)
              .filter((f: string) => f.endsWith(".sol"));
            if (files.length > 0) {
              codeToAudit = fs.readFileSync(
                path.join(contractsDir, files[0]),
                "utf8",
              );
            }
          }
        }

        if (!codeToAudit) {
          codeToAudit = "pragma solidity ^0.8.20; contract Dummy {}";
        }

        const report = await this.auditEngine.runAudit(codeToAudit);
        const hasCriticalOrHigh = report.issues.some(
          (issue) => issue.severity === "Critical" || issue.severity === "High",
        );
        if (hasCriticalOrHigh) {
          throw new Error(
            `Audit failed: deployment blocked due to critical/high risk vulnerabilities. Issues: ${JSON.stringify(report.issues)}`,
          );
        }
        return report;

      case "deploy_contract":
        const fs = require("fs");
        const path = require("path");
        const contracts: Record<string, string> = {};
        const contractsDir = path.resolve(process.cwd(), "contracts");
        if (fs.existsSync(contractsDir)) {
          const files = fs
            .readdirSync(contractsDir)
            .filter((f: string) => f.endsWith(".sol"));
          for (const f of files) {
            contracts[path.join("contracts", f)] = fs.readFileSync(
              path.join(contractsDir, f),
              "utf8",
            );
          }
        }
        if (Object.keys(contracts).length === 0) {
          contracts["contracts/Token.sol"] =
            "pragma solidity ^0.8.20; contract Token {}";
        }
        const compileRes =
          await this.actionLayer["deploymentEngine"].compile(contracts);
        if (compileRes.status === "failure") {
          throw new Error(
            `Compilation failed during deploy step: ${compileRes.metadata.errors?.join(", ")}`,
          );
        }
        const key =
          context?.deployerPrivateKey ||
          process.env.DEPLOYER_PRIVATE_KEY ||
          "0x0000000000000000000000000000000000000000000000000000000000000000";
        const deployRes = await this.actionLayer.deployContract(compileRes, key);
        if (deployRes.status === "success") {
          const mainFile = Object.keys(contracts)[0];
          const sourceCode = contracts[mainFile] || "";
          try {
            const verifyRes = await this.actionLayer.verifyDeployment(
              deployRes.metadata.contractAddress,
              sourceCode,
              { contractName: path.basename(mainFile, ".sol") }
            );
            deployRes.metadata.verificationStatus = verifyRes.status;
            deployRes.metadata.verificationMessage = verifyRes.metadata.message;
          } catch (e: any) {
            logger.warn(`Automatic verification failed: ${e.message}`);
          }
        }
        return deployRes;

      case "verify_contract":
        const contractAddr = params.contractAddress;
        let sourceCode = params.sourceCode || "";
        if (!sourceCode && params.filePath) {
          const fs = require("fs");
          const path = require("path");
          const resolved = path.resolve(process.cwd(), params.filePath);
          if (fs.existsSync(resolved)) {
            sourceCode = fs.readFileSync(resolved, "utf8");
          }
        }
        if (!sourceCode) {
          sourceCode = "pragma solidity ^0.8.20; contract Token {}";
        }
        return this.actionLayer.verifyDeployment(
          contractAddr,
          sourceCode,
          params,
        );

      case "search_docs":
        return this.knowledgeEngine.search(params.query || "");

      case "execute_action":
        const actionType = params.action;
        const privateKey =
          context?.deployerPrivateKey ||
          process.env.DEPLOYER_PRIVATE_KEY ||
          "0x0000000000000000000000000000000000000000000000000000000000000000";
        switch (actionType) {
          case "mint":
            return this.actionLayer.mint(
              params.contractAddress || "0x123",
              params.to || "0xabc",
              params.amount || "100",
              privateKey,
            );
          case "stake":
            return this.actionLayer.stake(
              params.contractAddress || "0x123",
              params.amount || "100",
              privateKey,
            );
          case "swap":
            return this.actionLayer.swap(
              params.contractAddress || "0x123",
              params.tokenIn || "0xabc",
              params.amountIn || "100",
              privateKey,
            );
          case "transfer":
            return this.actionLayer.transfer(
              params.to || "0xabc",
              params.amount || "100",
              privateKey,
              params.tokenAddress,
            );
          default:
            throw new Error(`Unsupported action type: ${actionType}`);
        }

      default:
        throw new Error(`Unknown skill name: ${skillName}`);
    }
  }

  public async createERC20Token(
    name: string,
    symbol: string,
    supply: string,
  ): Promise<GeneratedProject> {
    return this.route("generate_contract", {
      name,
      symbol,
      domain: "erc20",
      supply,
    });
  }

  public async createNFTCollection(
    name: string,
    symbol: string,
  ): Promise<GeneratedProject> {
    return this.route("generate_contract", { name, symbol, domain: "erc721" });
  }

  public async createStakingContract(
    rewardToken: string,
    stakingToken: string,
  ): Promise<GeneratedProject> {
    return this.route("generate_contract", {
      name: "SimpleStaking",
      symbol: "STAKE",
      domain: "staking",
      rewardToken,
      stakingToken,
    });
  }

  public async deployApplication(
    projectId: string,
    projectFiles: Record<string, string>,
    deployerPrivateKey: string,
  ): Promise<{
    contractAddress: string;
    transactionHash: string;
    verificationStatus: string;
  }> {
    const compileResult =
      await this.actionLayer["deploymentEngine"].compile(projectFiles);
    if (compileResult.status === "failure") {
      throw new Error(
        `Compilation failed: ${compileResult.metadata.errors?.join(", ")}`,
      );
    }
    const deployResult = await this.actionLayer.deployContract(
      compileResult,
      deployerPrivateKey,
    );
    if (deployResult.status !== "success") {
      throw new Error("Deployment to Monad Testnet failed");
    }
    const sourceCode = Object.values(projectFiles)[0] || "";
    const verifyResult = await this.actionLayer.verifyDeployment(
      deployResult.metadata.contractAddress,
      sourceCode,
    );
    return {
      contractAddress: deployResult.metadata.contractAddress,
      transactionHash: deployResult.metadata.transactionHash,
      verificationStatus: verifyResult.metadata.message,
    };
  }
}

export default AgentSkills;
