import { createLogger } from "@monadforge/sdk";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("ArchitectureReviewEngine");

export interface ReviewResult {
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  recommendations: string[];
}

export class ArchitectureReviewEngine {
  private writeReport(content: string): void {
    try {
      const reportPath = path.resolve(process.cwd(), "architecture-report.md");
      fs.writeFileSync(reportPath, content, "utf8");
      logger.info(`Architecture report written to ${reportPath}`);
    } catch (e: any) {
      logger.error(`Failed to write architecture-report.md: ${e.message}`);
    }
  }

  private generateMarkdownReport(title: string, result: ReviewResult): string {
    return `# Architecture Review: ${title}

## Strengths
${result.strengths.map((s) => `- ${s}`).join("\n")}

## Weaknesses
${result.weaknesses.map((w) => `- ${w}`).join("\n")}

## Risks
${result.risks.map((r) => `- ${r}`).join("\n")}

## Recommendations
${result.recommendations.map((rec) => `- ${rec}`).join("\n")}
`;
  }

  public async reviewArchitecture(
    contracts: Record<string, string>,
  ): Promise<string> {
    logger.info("Reviewing system architecture", {
      operation: "reviewArchitecture",
    });

    const strengths = ["Modular directory and contract separation"];
    const weaknesses = [
      "Absence of standard upgradeability patterns in compiled targets",
    ];
    const risks = [
      "Unchecked complexity in inter-contract communication calls",
    ];
    const recommendations = [
      "Adopt proxy models (UUPS/Transparent) for protocol lifetime flexibility",
    ];

    if (Object.keys(contracts).length > 1) {
      strengths.push("Multiple system components organized logically");
    } else {
      weaknesses.push(
        "Single contract monolith increases risk of reaching code size limits",
      );
    }

    const result: ReviewResult = {
      strengths,
      weaknesses,
      risks,
      recommendations,
    };
    const md = this.generateMarkdownReport(
      "Solidity Codebase Architecture",
      result,
    );
    this.writeReport(md);
    return md;
  }

  public async reviewProtocolDesign(design: string): Promise<string> {
    logger.info("Reviewing protocol design", {
      operation: "reviewProtocolDesign",
    });

    const strengths = ["Clear description of protocol components"];
    const weaknesses: string[] = [];
    const risks: string[] = [];
    const recommendations = [
      "Incorporate time-locks for parameter adjustments",
    ];

    const lowerDesign = design.toLowerCase();
    if (lowerDesign.includes("amm") || lowerDesign.includes("dex")) {
      strengths.push("Standard constant-product liquidity pool design pattern");
      weaknesses.push(
        "High exposure to impermanent loss for liquidity providers",
      );
      risks.push(
        "Frontrunning or sandwich attack vulnerability on large swaps",
      );
      recommendations.push(
        "Integrate oracle pricing or TWAP checks to prevent arbitrage exploits",
      );
    } else if (lowerDesign.includes("staking")) {
      strengths.push("Standard reward-rate accumulation system");
      weaknesses.push("Linear emission model without adjustment controls");
      risks.push("Inflation pressure on governance token value");
      recommendations.push(
        "Deploy a decay-based reward curve or dynamic staking multipliers",
      );
    } else if (
      lowerDesign.includes("dao") ||
      lowerDesign.includes("governance")
    ) {
      strengths.push("Quadratic voting or token-weighted vote aggregation");
      weaknesses.push(
        "Low participation or quorum requirements easily manipulated by flash loans",
      );
      risks.push("Flash loan proposal hijacking risk");
      recommendations.push(
        "Implement historical voting weight checkpoints (ERC20Votes)",
      );
    } else {
      weaknesses.push("No specific protocol template matched");
      risks.push("Untested protocol state transition logic");
    }

    const result: ReviewResult = {
      strengths,
      weaknesses,
      risks,
      recommendations,
    };
    const md = this.generateMarkdownReport(
      `Protocol Design: ${design.substring(0, 30)}...`,
      result,
    );
    this.writeReport(md);
    return md;
  }

  public async reviewSecurityModel(code: string): Promise<string> {
    logger.info("Reviewing security model", {
      operation: "reviewSecurityModel",
    });

    const strengths = ["Standard Solidity structure"];
    const weaknesses: string[] = [];
    const risks: string[] = [];
    const recommendations: string[] = [];

    if (code.includes("onlyOwner")) {
      strengths.push("Ownership restriction modifier implemented");
    } else {
      weaknesses.push(
        "Lack of centralized control or administrative emergency break (Pause)",
      );
      recommendations.push(
        "Introduce standard access control role separation (AccessControl)",
      );
    }

    if (code.includes("nonReentrant")) {
      strengths.push("State-changing functions protected against reentrancy");
    } else if (code.includes(".call{")) {
      weaknesses.push(
        "External low-level calls present without ReentrancyGuard",
      );
      risks.push("Potential reentrancy vulnerability via untrusted receivers");
      recommendations.push(
        "Apply nonReentrant modifier to all external call points",
      );
    }

    if (code.includes("tx.origin")) {
      weaknesses.push("Authorization checks utilizing tx.origin");
      risks.push("Caller spoofing and phishing hijacking vector");
      recommendations.push("Replace all tx.origin validations with msg.sender");
    }

    const result: ReviewResult = {
      strengths,
      weaknesses,
      risks,
      recommendations,
    };
    const md = this.generateMarkdownReport(
      "Security Model & Vulnerability Analysis",
      result,
    );
    this.writeReport(md);
    return md;
  }

  public async reviewScalability(architecture: string): Promise<string> {
    logger.info("Reviewing scalability model", {
      operation: "reviewScalability",
    });

    const strengths = ["Standard EVM compatibility"];
    const weaknesses = ["EVM storage slots consumption rate (gas cost impact)"];
    const risks = ["Out-of-gas limits on iterations over unbounded arrays"];
    const recommendations = [
      "Implement packing of uint sizes (e.g. uint128, uint96) inside structs",
    ];

    if (
      architecture.toLowerCase().includes("off-chain") ||
      architecture.toLowerCase().includes("l2") ||
      architecture.toLowerCase().includes("indexer")
    ) {
      strengths.push(
        "Efficient hybrid state storage with indexing service delegation",
      );
    } else {
      weaknesses.push(
        "Heavy reliance on on-chain storage increases gas cost for read-heavy flows",
      );
      recommendations.push(
        "Leverage events for non-critical historical state tracking",
      );
    }

    const result: ReviewResult = {
      strengths,
      weaknesses,
      risks,
      recommendations,
    };
    const md = this.generateMarkdownReport(
      "Scalability & Optimization Analysis",
      result,
    );
    this.writeReport(md);
    return md;
  }
}
