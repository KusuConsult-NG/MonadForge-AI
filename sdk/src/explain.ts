import { createLogger } from "./logging";

const logger = createLogger("Explainability");

/**
 * Generates a structured markdown explanation of the node's execution decisions,
 * planning steps, security audit repairs, and deployment outcomes.
 */
export function generateExecutionReasoning(trace: any): string {
  logger.info(`Generating execution reasoning for trace: ${trace.traceId}`);

  let md = `# MonadForge Execution Rationale\n\n`;
  md += `**Trace ID:** \`${trace.traceId}\`  \n`;
  md += `**Project:** \`${trace.projectId}\`  \n`;
  md += `**Timestamp:** \`${trace.timestamp}\`  \n`;
  md += `**Final Status:** ${trace.finalStatus === "success" ? "✅ Success" : "❌ Failed"}\n\n`;

  md += `## 1. Intent Analysis\n`;
  if (trace.intent) {
    md += `The node parsed a **${trace.intent.type}** intent targeting the **${trace.intent.domain?.toUpperCase()}** domain.  \n`;
    if (trace.intent.constraints && trace.intent.constraints.length > 0) {
      md += `**Developer constraints specified:**\n`;
      trace.intent.constraints.forEach((c: string) => {
        md += `- ${c}\n`;
      });
    }
  } else {
    md += `No structured intent was detected.\n`;
  }
  md += `\n`;

  md += `## 2. Planning & Composition Decisions\n`;
  if (trace.plan && trace.plan.steps) {
    md += `The planning engine generated a topological composition of **${trace.plan.steps.length} steps**:\n`;
    trace.plan.steps.forEach((step: any) => {
      md += `${step.id}. **[${step.skillName}]** ${step.description} (Status: *${step.status}*)\n`;
    });
  }
  md += `\n`;

  md += `## 3. Self-Healing & Audit Actions\n`;
  if (trace.repairs && trace.repairs.length > 0) {
    md += `The self-healing engine executed **${trace.repairs.length} repair operations**:\n`;
    trace.repairs.forEach((rep: any) => {
      md += `### Repair Details\n`;
      md += `- **Issues Diagnosed:** ${rep.issues.join("; ")}\n`;
      if (rep.explanation) {
        md += `- **Rationale:** ${rep.explanation}\n`;
      }
    });
  } else {
    md += `No security vulnerabilities or compilation failures were detected; no self-healing actions were necessary.\n`;
  }
  md += `\n`;

  md += `## 4. Deployment & Explorer Verification\n`;
  if (trace.deployments && trace.deployments.length > 0) {
    trace.deployments.forEach((d: any) => {
      md += `- **Contract Address:** \`${d.contractAddress}\`\n`;
      md += `- **Transaction Hash:** \`${d.transactionHash}\`\n`;
      md += `- **Gas Used:** \`${d.gasUsed}\`\n`;
      if (d.verificationStatus) {
        md += `- **Block Explorer Verification:** ${d.verificationStatus === "success" ? "✅ Verified" : "❌ Failed"} (${d.verificationMessage})\n`;
      }
    });
  } else {
    md += `No deployments were executed in this trace.\n`;
  }
  md += `\n`;

  md += `---\n*Generated autonomously by MonadForge Explainability Layer.*`;
  return md;
}
