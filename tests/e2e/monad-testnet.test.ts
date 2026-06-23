import { DeploymentEngine } from "@monadforge/actions";
import { resetConfigForTesting } from "@monadforge/sdk";

describe("Monad Testnet E2E Integration", () => {
  const runE2E = process.env.RUN_E2E_TESTS === "true";
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!runE2E) {
    it("should skip E2E tests because RUN_E2E_TESTS is not set to true", () => {
      console.log("Skipping E2E tests");
    });
    return;
  }

  if (
    !deployerKey ||
    deployerKey ===
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    it("should skip E2E tests because DEPLOYER_PRIVATE_KEY is not set or is zero address", () => {
      console.log("Skipping E2E tests (no funded private key)");
    });
    return;
  }

  it("should compile, deploy, and verify a simple contract on Monad Testnet", async () => {
    const engine = new DeploymentEngine();

    const files = {
      "contracts/SimpleToken.sol": `
pragma solidity ^0.8.20;

contract SimpleToken {
    string public name = "SimpleToken";
    string public symbol = "SIM";
    uint8 public decimals = 18;
    uint256 public totalSupply = 1000000 * 10**18;
    mapping(address => uint256) public balanceOf;

    constructor() {
        balanceOf[msg.sender] = totalSupply;
    }
}
      `.trim(),
    };

    console.log("E2E: Compiling contract...");
    const compileRes = await engine.compile(files);
    expect(compileRes.metadata.success).toBe(true);
    expect(compileRes.metadata.bytecode).toBeDefined();

    console.log("E2E: Deploying contract to Monad Testnet...");

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    resetConfigForTesting();

    try {
      const deployRes = await engine.deployToTestnet(compileRes, deployerKey);

      console.log("E2E: Deployment response:", deployRes);
      expect(deployRes.status).toBe("success");
      expect(deployRes.metadata.contractAddress).toBeDefined();
      expect(deployRes.metadata.contractAddress).not.toBe("");

      console.log(
        `E2E: Verifying contract at address ${deployRes.metadata.contractAddress}...`,
      );
      const verifyRes = await engine.verifyDeployment(
        deployRes.metadata.contractAddress,
        files["contracts/SimpleToken.sol"],
        { contractName: "SimpleToken" },
      );

      console.log("E2E: Verification response:", verifyRes);
      expect(verifyRes).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      resetConfigForTesting();
    }
  }, 120000);
});
