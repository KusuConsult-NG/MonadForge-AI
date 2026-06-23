import { RepairEngine } from "../src/index";
import * as fs from "fs";
import * as path from "path";

describe("RepairEngine Unit Tests", () => {
  let engine: RepairEngine;
  const reportPath = path.resolve(process.cwd(), "repair-report.json");

  beforeEach(() => {
    engine = new RepairEngine();
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
  });

  it("should repair access control and reentrancy issues in a contract and write report", async () => {
    const badCode = `
      contract MyToken {
        function mint(address to, uint256 amount) public {
          balances[to] += amount;
        }
        function withdraw() public {
          payable(msg.sender).call{value: 100}("");
        }
      }
    `;

    const res = await engine.repairContracts(badCode, [
      "ACCESS-001",
      "REENTRANCY-001",
    ]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain(
      "mint(address to, uint256 amount) public onlyOwner",
    );
    expect(res.fixedCode).toContain("withdraw() public nonReentrant onlyOwner");
    expect(res.fixedCode).toContain(
      'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";',
    );
    expect(res.fixedCode).toContain("contract MyToken is ReentrancyGuard");
    expect(engine.getLog().length).toBe(1);
    expect(engine.getLog()[0].finalOutcome).toBe("success");

    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(report.issue).toContain("ACCESS-001");
    expect(report.diagnosis).toBeDefined();
    expect(report["applied fix"]).toBeDefined();
    expect(report["validation result"]).toBeDefined();
  });

  it("should repair compilation errors (missing semicolon and pragma)", async () => {
    const badContracts = {
      "contracts/Token.sol": "pragma solidity ^0.8.20\ncontract Token {}",
    };

    const res = await engine.repairCompilation(badContracts, [
      "Expected ';' but got end of source",
    ]);
    expect(res.success).toBe(true);
    expect(res.fixedContracts["contracts/Token.sol"]).toContain(
      "pragma solidity ^0.8.20;",
    );

    const missingPragma = {
      "contracts/Token.sol": "contract Token {}",
    };
    const resPragma = await engine.repairCompilation(missingPragma, [
      "Missing Compiler Pragma Directive",
    ]);
    expect(resPragma.success).toBe(true);
    expect(resPragma.fixedContracts["contracts/Token.sol"]).toContain(
      "pragma solidity ^0.8.20;",
    );
  });

  it("should handle deployment repair cases", async () => {
    const resFaucet = await engine.repairDeployment("Token", "0 MON balance");
    expect(resFaucet.success).toBe(true);
    expect(resFaucet.action).toContain("faucet");

    const resNetwork = await engine.repairDeployment(
      "Token",
      "Network offline",
    );
    expect(resNetwork.success).toBe(true);
    expect(resNetwork.action).toContain("fallback");

    const resUnknown = await engine.repairDeployment(
      "Token",
      "Some random error",
    );
    expect(resUnknown.success).toBe(false);
  });

  it("should repair missing imports", async () => {
    const code = "contract Token is ERC20, Ownable {}";
    const res = await engine.repairImports(code, ["ERC20", "Ownable"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain(
      'import "@openzeppelin/contracts/token/ERC20/ERC20.sol";',
    );
    expect(res.fixedCode).toContain(
      'import "@openzeppelin/contracts/access/Ownable.sol";',
    );
  });

  it("should repair configurations", async () => {
    const config = {};
    const res = await engine.repairConfiguration(
      config,
      "Missing DEPLOYER_PRIVATE_KEY",
    );
    expect(res.success).toBe(true);
    expect(res.fixedConfig.DEPLOYER_PRIVATE_KEY).toBeDefined();
  });

  it("should repair test failures", async () => {
    const testCode = "expect(5).toBe(10)";
    const res = await engine.repairTests(testCode, [
      "Expected: 10\n      Received: 5",
    ]);
    expect(res.success).toBe(true);
    expect(testCode).toBe("expect(5).toBe(10)");
    expect(res.fixedTestCode).toContain("expect(10).toBe(10)");

    const resFail = await engine.repairTests(testCode, ["Some other failures"]);
    expect(resFail.success).toBe(false);
  });

  it("should handle writeReportFile errors gracefully", async () => {
    const fsLib = require("fs");
    const writeSpy = jest
      .spyOn(fsLib, "writeFileSync")
      .mockImplementation(() => {
        throw new Error("Disk full");
      });

    const badContracts = {
      "contracts/Token.sol": "contract Token {}",
    };

    // This should run without crashing
    const res = await engine.repairCompilation(badContracts, [
      "Missing Compiler Pragma Directive",
    ]);
    expect(res.success).toBe(true);
    writeSpy.mockRestore();
  });

  it("should handle compile failure validation during repairCompilation", async () => {
    const { ActionLayer } = require("@monadforge/actions");
    const compileSpy = jest
      .spyOn(ActionLayer.prototype, "compile")
      .mockResolvedValue({
        status: "failure",
        action: "compile",
        metadata: {
          success: false,
          abi: [],
          bytecode: "",
          errors: ["Fatal type check mismatch"],
        },
      });

    const badContracts = {
      "contracts/Token.sol": "contract Token {}",
    };

    const res = await engine.repairCompilation(badContracts, [
      "Missing Compiler Pragma Directive",
    ]);
    expect(res.success).toBe(false);
    expect(res.fixedContracts["contracts/Token.sol"]).toContain(
      "pragma solidity",
    );

    compileSpy.mockRestore();
  });

  it("should repair Parallel EVM storage slot contention (MONAD-001)", async () => {
    const badCode = `
      contract Counter {
        uint256 public count;
        uint256 public totalCoins;
        
        function increment() public {
          count++;
        }
        function addCoins(uint256 amount) public {
          totalCoins += amount;
        }
        function setCoins(uint256 amount) public {
          totalCoins = amount;
        }
      }
    `;

    const res = await engine.repairContracts(badCode, [
      "MONAD-001",
    ]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain("mapping(address => uint256) public countPartition;");
    expect(res.fixedCode).toContain("countPartition[msg.sender]++;");
    expect(res.fixedCode).toContain("mapping(address => uint256) public totalCoinsPartition;");
    expect(res.fixedCode).toContain("totalCoinsPartition[msg.sender] += amount;");
    expect(res.fixedCode).toContain("totalCoinsPartition[msg.sender] = amount;");
  });

  it("should repair MONAD-001 with uint128 type and fix emit/return references", async () => {
    const badCode = `
      contract Tracker {
        uint128 public score;
        event ScoreUpdated(uint128 newScore);
        function increment() public {
          score++;
          emit ScoreUpdated(score);
        }
        function getScore() public view returns (uint128) {
          return score;
        }
      }
    `;
    const res = await engine.repairContracts(badCode, ["MONAD-001"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain("mapping(address => uint128) public scorePartition;");
    expect(res.fixedCode).toContain("scorePartition[msg.sender]++");
  });

  it("should inject ECON-001 oracle repair stub", async () => {
    const code = `
      contract PriceFeed {
        IUniswapV2Pair pair;
        function getPrice() external view returns (uint) {
          (uint reserve0, uint reserve1,) = pair.getReserves();
          return reserve0 / reserve1;
        }
      }
    `;
    const res = await engine.repairContracts(code, ["ECON-001"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain("trustedOracle");
    expect(res.fixedCode).toContain("requireTWAP");
  });

  it("should inject ECON-002 flash-loan callback guard", async () => {
    const code = `
      contract FlashBorrower {
        function executeOperation(address asset, uint amount, uint fee, address initiator, bytes calldata params) external returns (bool) {
          return true;
        }
      }
    `;
    const res = await engine.repairContracts(code, ["ECON-002"]);
    expect(res.success).toBe(true);
    // The guard or trustedPool should be injected
    expect(res.fixedCode.includes("trustedPool") || res.fixedCode.includes("Unauthorized")).toBe(true);
  });

  it("should repair UPGRADE-001 unsafe constructor in upgradeable contract", async () => {
    const badCode = `
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract MyToken is Initializable {
        uint256 public value;
        constructor() {
          value = 100;
        }
      }
    `;
    const res = await engine.repairContracts(badCode, ["UPGRADE-001"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain("_disableInitializers()");
  });

  it("should inject constructor with _disableInitializers if contract has no constructor for UPGRADE-001", async () => {
    const badCode = `
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract MyToken is Initializable {
        uint256 public value;
      }
    `;
    const res = await engine.repairContracts(badCode, ["UPGRADE-001"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain("_disableInitializers()");
  });

  it("should repair UPGRADE-002 initialized state variables in upgradeable contract", async () => {
    const badCode = `
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract MyToken is Initializable {
        uint256 public value = 100;
        address public admin = msg.sender;
        
        function initialize() public initializer {
          // empty
        }
      }
    `;
    const res = await engine.repairContracts(badCode, ["UPGRADE-002"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).not.toContain("uint256 public value = 100;");
    expect(res.fixedCode).not.toContain("address public admin = msg.sender;");
    expect(res.fixedCode).toContain("uint256 public value;");
    expect(res.fixedCode).toContain("address public admin;");
    expect(res.fixedCode).toContain("value = 100;");
    expect(res.fixedCode).toContain("admin = msg.sender;");
  });

  it("should create initialize method and inherit Initializable if missing for UPGRADE-002", async () => {
    const badCode = `
      contract MyToken {
        uint256 public value = 100;
      }
    `;
    const res = await engine.repairContracts(badCode, ["UPGRADE-002"]);
    expect(res.success).toBe(true);
    expect(res.fixedCode).toContain("contract MyToken is Initializable");
    expect(res.fixedCode).toContain("function initialize() public initializer");
    expect(res.fixedCode).toContain("value = 100;");
  });

  it("should skip variable partitioning in MONAD-001 if already partitioned", async () => {
    const code = `
      contract MyToken {
        mapping(address => uint256) public valuePartition;
        function update() public {
          valuePartition[msg.sender]++;
        }
      }
    `;
    const res = await engine.repairContracts(code, ["MONAD-001"]);
    expect(res.success).toBe(false);
  });
});

