import { generateExecutionReasoning } from "../src";

describe("Explainability Engine", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("should generate structured rationale for a successful trace with intent constraints, plan steps, repairs, and verified deployments", () => {
    const trace = {
      traceId: "trace-123",
      projectId: "project-abc",
      timestamp: "2026-06-23T09:00:00Z",
      finalStatus: "success",
      intent: {
        type: "deploy",
        domain: "staking",
        constraints: ["Must use ReentrancyGuard", "Solidity version 0.8.20"],
      },
      plan: {
        steps: [
          {
            id: 1,
            skillName: "generate_contract",
            description: "Generate staking smart contract",
            status: "completed",
          },
          {
            id: 2,
            skillName: "run_audit",
            description: "Run security audit",
            status: "completed",
          },
          {
            id: 3,
            skillName: "deploy_contract",
            description: "Deploy to testnet",
            status: "completed",
          },
        ],
      },
      repairs: [
        {
          issues: ["Reentrancy risk in withdraw()", "Missing access control"],
          explanation:
            "Added ReentrancyGuard and onlyOwner modifier to sensitive functions.",
          originalCode: "contract Staking {}",
          repairedCode: "contract Staking is ReentrancyGuard {}",
        },
      ],
      deployments: [
        {
          contractAddress: "0xDePloYedContractAddResS0000000000000000123",
          transactionHash: "0xTxHaSh00000000000000000000000000000000000123",
          gasUsed: "120000",
          verificationStatus: "success",
          verificationMessage: "Verified on MonadSourcify",
        },
      ],
    };

    const rationale = generateExecutionReasoning(trace);

    // Verify key sections are present in markdown output
    expect(rationale).toContain("# MonadForge AI Execution Rationale");
    expect(rationale).toContain("**Trace ID:** `trace-123`");
    expect(rationale).toContain("**Project:** `project-abc`");
    expect(rationale).toContain("**Timestamp:** `2026-06-23T09:00:00Z`");
    expect(rationale).toContain("**Final Status:** ✅ Success");
    expect(rationale).toContain(
      "The agent parsed a **deploy** intent targeting the **STAKING** domain.",
    );
    expect(rationale).toContain("Developer constraints specified:");
    expect(rationale).toContain("- Must use ReentrancyGuard");
    expect(rationale).toContain("- Solidity version 0.8.20");
    expect(rationale).toContain(
      "The planning engine generated a topological composition of **3 steps**:",
    );
    expect(rationale).toContain(
      "1. **[generate_contract]** Generate staking smart contract (Status: *completed*)",
    );
    expect(rationale).toContain(
      "The self-healing engine executed **1 repair operations**:",
    );
    expect(rationale).toContain(
      "**Issues Diagnosed:** Reentrancy risk in withdraw(); Missing access control",
    );
    expect(rationale).toContain(
      "**Rationale:** Added ReentrancyGuard and onlyOwner modifier to sensitive functions.",
    );
    expect(rationale).toContain(
      "**Contract Address:** `0xDePloYedContractAddResS0000000000000000123`",
    );
    expect(rationale).toContain(
      "**Transaction Hash:** `0xTxHaSh00000000000000000000000000000000000123`",
    );
    expect(rationale).toContain(
      "**Block Explorer Verification:** ✅ Verified (Verified on MonadSourcify)",
    );
  });

  it("should generate minimal rationale for a failed trace with no intent, no plan steps, no repairs, and no deployments", () => {
    const trace = {
      traceId: "trace-456",
      projectId: "project-xyz",
      timestamp: "2026-06-23T09:15:00Z",
      finalStatus: "failed",
      intent: null,
      plan: null,
      repairs: [],
      deployments: [],
    };

    const rationale = generateExecutionReasoning(trace);

    expect(rationale).toContain("**Final Status:** ❌ Failed");
    expect(rationale).toContain("No structured intent was detected.");
    expect(rationale).toContain(
      "No security vulnerabilities or compilation failures were detected; no self-healing actions were necessary.",
    );
    expect(rationale).toContain("No deployments were executed in this trace.");
  });

  it("should generate rationale for intent with empty constraints list", () => {
    const trace = {
      traceId: "trace-789",
      projectId: "project-123",
      timestamp: "2026-06-23T09:30:00Z",
      finalStatus: "success",
      intent: {
        type: "audit",
        domain: "token",
        constraints: [],
      },
      plan: {
        steps: [],
      },
      repairs: [
        {
          issues: ["Syntax error"],
          originalCode: "foo",
          repairedCode: "bar",
        },
      ],
      deployments: [
        {
          contractAddress: "0x123",
          transactionHash: "0x456",
          gasUsed: "1000",
        },
      ],
    };

    const rationale = generateExecutionReasoning(trace);

    expect(rationale).toContain(
      "The agent parsed a **audit** intent targeting the **TOKEN** domain.",
    );
    expect(rationale).not.toContain("Developer constraints specified:");
    expect(rationale).toContain("**Issues Diagnosed:** Syntax error");
    expect(rationale).not.toContain("Rationale:");
    expect(rationale).not.toContain("Block Explorer Verification:");
  });

  it("should handle failed block explorer verification in deployments block", () => {
    const trace = {
      traceId: "trace-999",
      projectId: "project-999",
      timestamp: "2026-06-23T09:45:00Z",
      finalStatus: "success",
      plan: {
        steps: [],
      },
      repairs: [],
      deployments: [
        {
          contractAddress: "0x123",
          transactionHash: "0x456",
          gasUsed: "1000",
          verificationStatus: "failed",
          verificationMessage: "Sourcify API offline",
        },
      ],
    };

    const rationale = generateExecutionReasoning(trace);
    expect(rationale).toContain(
      "**Block Explorer Verification:** ❌ Failed (Sourcify API offline)",
    );
  });
});
