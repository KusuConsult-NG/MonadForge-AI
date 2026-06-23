import { RuntimeEngine } from "../src/index";

// Mock the AgentSkills class to prevent real network calls
export const mockRoute = jest.fn();
jest.mock("@monadforge/skills", () => {
  return {
    AgentSkills: jest.fn().mockImplementation(() => {
      return {
        route: mockRoute,
      };
    }),
  };
});

describe("RuntimeEngine Unit Tests", () => {
  let runtime: RuntimeEngine;

  beforeEach(() => {
    runtime = new RuntimeEngine();
    mockRoute.mockClear();
  });

  it("should run successful pipeline from intent parsing to result return", async () => {
    mockRoute.mockResolvedValueOnce({ generated: true }); // generate_contract
    mockRoute.mockResolvedValueOnce({ riskScore: 0, issues: [] }); // run_audit

    const res = await runtime.execute(
      "Generate an erc20 token called ForgeToken",
    );
    expect(res.success).toBe(true);
    expect(res.intent.type).toBe("generate");
    expect(res.intent.domain).toBe("erc20");
    expect(res.results).toHaveLength(2);
    expect(res.results[0].success).toBe(true);
    expect(res.results[1].success).toBe(true);
  });

  it("should abort pipeline execution on step failure (e.g. audit block)", async () => {
    mockRoute.mockRejectedValueOnce(
      new Error("Audit failed: critical vulnerability detected"),
    );

    const res = await runtime.execute("deploy project my-token");
    expect(res.success).toBe(false);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].success).toBe(false);
    expect(res.results[0].error).toContain("Audit failed");
    expect(mockRoute).toHaveBeenCalledTimes(1); // Aborted before deploy step
  });
});
