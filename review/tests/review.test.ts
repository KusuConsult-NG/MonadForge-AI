import { ArchitectureReviewEngine } from "../src/index";
import * as fs from "fs";
import * as path from "path";

describe("ArchitectureReviewEngine Unit Tests", () => {
  let engine: ArchitectureReviewEngine;
  const reportPath = path.resolve(process.cwd(), "architecture-report.md");

  beforeEach(() => {
    engine = new ArchitectureReviewEngine();
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  });

  it("should review architecture with single and multiple contracts", async () => {
    const singleRes = await engine.reviewArchitecture({
      "contracts/Token.sol": "contract Token {}",
    });
    expect(singleRes).toContain("monolith");
    expect(fs.existsSync(reportPath)).toBe(true);

    const multiRes = await engine.reviewArchitecture({
      "contracts/Token.sol": "contract Token {}",
      "contracts/Storage.sol": "contract Storage {}",
    });
    expect(multiRes).toContain("Multiple system components");
  });

  it("should review AMM, staking, and governance protocol designs", async () => {
    const ammRes = await engine.reviewProtocolDesign("This is an AMM pool");
    expect(ammRes).toContain("Frontrunning");

    const stakeRes = await engine.reviewProtocolDesign(
      "Staking contract for yield",
    );
    expect(stakeRes).toContain("emission model");

    const daoRes = await engine.reviewProtocolDesign("DAO governance system");
    expect(daoRes).toContain("flash loan");

    const defaultRes = await engine.reviewProtocolDesign("unknown design");
    expect(defaultRes).toContain("No specific protocol template matched");
  });

  it("should review security models with modifiers, call, and tx.origin", async () => {
    const secureRes = await engine.reviewSecurityModel(
      "contract Token { function mint() public onlyOwner nonReentrant {} }",
    );
    expect(secureRes).toContain("Ownership restriction modifier");

    const vulnRes = await engine.reviewSecurityModel(
      'contract Token { function withdraw() public { msg.sender.call{value: 1}(""); } }',
    );
    expect(vulnRes).toContain("External low-level calls present");

    const txOriginRes = await engine.reviewSecurityModel(
      "contract Token { function test() public { require(tx.origin == msg.sender); } }",
    );
    expect(txOriginRes).toContain("tx.origin");
  });

  it("should review scalability with and without off-chain indexing references", async () => {
    const indexRes = await engine.reviewScalability(
      "Hybrid storage with off-chain indexer",
    );
    expect(indexRes).toContain("hybrid state storage");

    const plainRes = await engine.reviewScalability(
      "Basic on-chain only contracts",
    );
    expect(plainRes).toContain("Heavy reliance on on-chain storage");
  });
});
