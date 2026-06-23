import { AuditEngine } from "../src/index";

let shouldParserThrow = false;

jest.mock("@solidity-parser/parser", () => {
  const original = jest.requireActual("@solidity-parser/parser");
  return {
    ...original,
    parse: (...args: any[]) => {
      if (shouldParserThrow) {
        throw new Error("Force fallback to regex");
      }
      return original.parse(...args);
    }
  };
});

[true, false].forEach((fallbackMode) => {
  describe(`AuditEngine Unit Tests (Fallback Mode: ${fallbackMode})`, () => {
    let engine: AuditEngine;

    beforeEach(() => {
      engine = new AuditEngine();
      shouldParserThrow = fallbackMode;
    });

  it("should scan clean contract with zero issues", async () => {
    const cleanContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SafeToken is Ownable {
    constructor() Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        // Safe logic
    }
}
`;
    const report = await engine.runAudit(cleanContract);
    expect(report.riskScore).toBe(0);
    expect(report.issues.length).toBe(0);
  });

  it("should detect outdated compiler warning", async () => {
    const oldContract = `pragma solidity ^0.7.0;
contract OldOne {}
`;
    const report = await engine.runAudit(oldContract);
    expect(report.issues.some((i) => i.id === "OVERFLOW-001")).toBe(true);
    expect(report.riskScore).toBeGreaterThan(0);
  });

  it("should detect missing compiler directive", async () => {
    const noPragma = `contract Test {}`;
    const report = await engine.runAudit(noPragma);
    expect(report.issues.some((i) => i.id === "PRAGMA-001")).toBe(true);
  });

  it("should detect unprotected sensitive functions", async () => {
    const unprotectedContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Unprotected {
    function mintTokens(address to) public {
        // unprotected mint
    }
    
    function withdrawBalance() external {
        // unprotected withdraw
    }
}
`;
    const report = await engine.runAudit(unprotectedContract);
    expect(report.issues.some((i) => i.id === "ACCESS-001")).toBe(true);
    // Should flag both mintTokens and withdrawBalance
    const accessIssues = report.issues.filter((i) => i.id === "ACCESS-001");
    expect(accessIssues.length).toBe(2);
  });

  it("should flag reentrancy vulnerability without guard", async () => {
    const badContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadReentrant {
    mapping(address => uint) balances;

    function withdraw() public {
        uint bal = balances[msg.sender];
        msg.sender.call{value: bal}("");
        balances[msg.sender] = 0; // State update after external call
    }
}
`;
    const report = await engine.runAudit(badContract);
    // Should flag missing guard and update after call
    expect(report.issues.some((i) => i.id === "REENTRANCY-001")).toBe(true);
    expect(report.issues.some((i) => i.id === "REENTRANCY-002")).toBe(true);
    expect(report.issues.some((i) => i.id === "CALL-001")).toBe(true);
    expect(report.riskScore).toBeGreaterThan(50);
  });

  it("should evaluate reentrancy with function modifiers present", async () => {
    const badContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadReentrantWithModifier {
    mapping(address => uint) balances;

    modifier onlyOwner() {
        require(msg.sender == address(0));
        _;
    }

    function withdraw() public onlyOwner {
        uint bal = balances[msg.sender];
        msg.sender.call{value: bal}("");
        balances[msg.sender] = 0;
    }
}
`;
    const report = await engine.runAudit(badContract);
    expect(report.issues.some((i) => i.id === "REENTRANCY-001")).toBe(true);
  });

  it("should suggest gas optimization", async () => {
    const gasContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GasTest {
    function calculate() public {
        // do calculation
    }
}
`;
    const report = await engine.runAudit(gasContract);
    expect(report.issues.some((i) => i.id === "GAS-001")).toBe(true);
  });

  it("should flag oracle manipulation risk (ECON-001)", async () => {
    const vulnerableContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OracleTest {
    address public pairAddress;
    
    function getSpotPrice() public view returns (uint256) {
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pairAddress).getReserves();
        return uint256(reserve0) / uint256(reserve1);
    }
}
`;
    const report = await engine.runAudit(vulnerableContract);
    expect(report.issues.some((i) => i.id === "ECON-001")).toBe(true);
  });

  it("should flag unprotected flash loan callbacks (ECON-002)", async () => {
    const vulnerableContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FlashLoanCallback {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        // performs arbitrage or swaps without verifying msg.sender is trusted lending pool
        return true;
    }
}
`;
    const report = await engine.runAudit(vulnerableContract);
    expect(report.issues.some((i) => i.id === "ECON-002")).toBe(true);
  });

  it("should not flag ECON-001 if getReserves is used alongside Chainlink oracle", async () => {
    const safeContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SafeOracleTest {
    address public pairAddress;
    address public oracleAddress;
    
    function getSafePrice() public view returns (uint256) {
        (,,uint256 price,,) = IChainlink(oracleAddress).latestRoundData();
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pairAddress).getReserves();
        return price;
    }
}
`;
    const report = await engine.runAudit(safeContract);
    expect(report.issues.some((i) => i.id === "ECON-001")).toBe(false);
  });

  it("should not flag ECON-002 if flash loan callback verifies msg.sender", async () => {
    const safeContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SafeFlashLoanCallback {
    address public trustedPool;
    
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == trustedPool, "unauthorized");
        return true;
    }
}
`;
    const report = await engine.runAudit(safeContract);
    expect(report.issues.some((i) => i.id === "ECON-002")).toBe(false);
  });

  it("should calculate risk score correctly with Low severity issues", async () => {
    const originalPush = Array.prototype.push;
    Array.prototype.push = function (...args) {
      const item = args[0];
      if (item && item.severity) {
        item.severity = "Low";
      }
      return originalPush.apply(this, args);
    };

    const report = await engine.runAudit("pragma solidity ^0.7.0;");
    expect(report.issues[0].severity).toBe("Low");
    expect(report.riskScore).toBe(5);

    Array.prototype.push = originalPush;
  });

    it("should fallback to empty string if function name match fails", async () => {
      if (!fallbackMode) {
        return;
      }
      const originalMatch = String.prototype.match;
      String.prototype.match = function (regex: any) {
        if (regex && regex.source === "function\\s+(\\w+)") {
          return null;
        }
        return originalMatch.call(this, regex);
      };

      const report = await engine.runAudit("function mint() public {}");
      // Function name match fails, so it is treated as not sensitive and no access control issue is created
      expect(report.issues.some((issue) => issue.id === "ACCESS-001")).toBe(
        false,
      );

      String.prototype.match = originalMatch;
    });

  it("should detect tx.origin authorization checks via require", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          address owner;
          function setOwner() public {
              require(tx.origin == owner);
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "TX-ORIGIN-001")).toBe(true);
  });

  it("should detect tx.origin authorization checks via if", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          address owner;
          function checkOther() public {
              if (tx.origin != owner) revert();
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "TX-ORIGIN-001")).toBe(true);
  });

  it("should detect unchecked ERC20 transfers", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          function doTransfer(address token, address to, uint256 amount) public {
              IERC20(token).transfer(to, amount);
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "ERC20-TRANSFER-001")).toBe(true);
  });

  it("should not flag safe/handled ERC20 transfers", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          // Function definition, not a call
          function transfer(address to, uint256 amount) public returns (bool) {
              return true;
          }
          function doTransfer(address token, address to, uint256 amount) public {
              require(IERC20(token).transfer(to, amount), "failed");
              bool success = IERC20(token).transferFrom(msg.sender, to, amount);
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "ERC20-TRANSFER-001")).toBe(
      false,
    );
  });

  it("should detect block.timestamp weak randomness", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          function rand() public view returns (uint256) {
              return uint256(keccak256(abi.encodePacked(block.timestamp)));
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "TIMESTAMP-001")).toBe(true);
  });

  it("should detect block.timestamp timing dependencies (operator on right)", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 releaseTime;
          function isReleased() public view returns (bool) {
              return block.timestamp >= releaseTime;
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "TIMESTAMP-002")).toBe(true);
  });

  it("should detect block.timestamp timing dependencies (operator on left)", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 releaseTime;
          function isReleased() public view returns (bool) {
              return releaseTime >= block.timestamp;
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "TIMESTAMP-002")).toBe(true);
  });

  it("should detect function argument shadowing state variable", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 public myVal;
          address private owner;
          function setVal(uint256 myVal) public {
              // argument shadowing
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "SHADOW-001")).toBe(true);
  });

  it("should detect local variable shadowing state variable", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 public myVal;
          function setVal() public {
              uint256 myVal = 10;
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "SHADOW-002")).toBe(true);
  });

  it("should handle tx.origin without require or if", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          address o = tx.origin;
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "TX-ORIGIN-001")).toBe(false);
  });

  it("should handle block.timestamp without comparisons or randomness", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 t = block.timestamp;
      }
    `;
    const report = await engine.runAudit(code);
    expect(
      report.issues.some(
        (i) => i.id === "TIMESTAMP-001" || i.id === "TIMESTAMP-002",
      ),
    ).toBe(false);
  });

  it("should detect parallel EVM storage slot contention (MONAD-001)", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 public totalStaked;
          function stake() public {
              totalStaked += 10;
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "MONAD-001")).toBe(true);
  });

  it("should not detect parallel EVM storage slot contention in view functions", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 public totalStaked;
          function getStaked() public view returns (uint256) {
              return totalStaked;
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "MONAD-001")).toBe(false);
  });

  it("should flag reentrancy vulnerability with unary operation", async () => {
    const badContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadReentrantUnary {
    mapping(address => uint) balances;

    function withdraw() public {
        msg.sender.call("");
        balances[msg.sender]--; // Unary state update after external call
    }
}
`;
    const report = await engine.runAudit(badContract);
    if (!fallbackMode) {
      expect(report.issues.some((i) => i.id === "REENTRANCY-002")).toBe(true);
    } else {
      expect(report.issues.some((i) => i.id === "REENTRANCY-002")).toBe(false);
    }
  });

  it("should detect parallel EVM storage slot contention with unary operator", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Test {
          uint256 public totalStaked;
          function stake() public {
              totalStaked++;
          }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "MONAD-001")).toBe(true);
  });

  it("should detect ECON-003 swap without slippage guard", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Trader {
        IUniswapV2Router router;
        function buyToken(address token) external {
          router.swapExactTokensForTokens(100, 0, new address[](2), msg.sender, block.timestamp);
        }
      }
    `;
    const report = await engine.runAudit(code);
    // Should detect swap without amountOutMin / deadline
    expect(report.issues.some((i) => i.id === "ECON-003")).toBe(true);
  });

  it("should NOT detect ECON-003 when slippage guard is present", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract SafeTrader {
        IUniswapV2Router router;
        function buyToken(address token, uint amountOutMin, uint deadline) external {
          router.swapExactTokensForTokens(100, amountOutMin, new address[](2), msg.sender, deadline);
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "ECON-003")).toBe(false);
  });

  it("should detect ECON-004 ERC-4626 share inflation vulnerability", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract MyVault {
        IERC20 token;
        function totalAssets() public view returns (uint256) {
          return token.balanceOf(address(this));
        }
        function deposit(uint256 amount) external {
          token.transferFrom(msg.sender, address(this), amount);
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "ECON-004")).toBe(true);
  });

  it("should detect ECON-005 unchecked token decimals in arithmetic", async () => {
    const code = `
      pragma solidity ^0.8.20;
      contract Normalizer {
        function normalize(IERC20 token, uint256 amount) public view returns (uint256) {
          return amount / (10 ** token.decimals());
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "ECON-005")).toBe(true);
  });

  it("should detect UPGRADE-001 constructor with state assignments in upgradeable contract", async () => {
    const code = `
      pragma solidity ^0.8.20;
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract UpgradeableToken is Initializable {
        uint256 public value;
        constructor() {
          value = 100;
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "UPGRADE-001")).toBe(true);
  });

  it("should detect UPGRADE-002 state variable initialized at declaration in upgradeable contract", async () => {
    const code = `
      pragma solidity ^0.8.20;
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract UpgradeableToken is Initializable {
        uint256 public value = 100;
        function initialize() public initializer {}
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "UPGRADE-002")).toBe(true);
  });

  it("should detect UPGRADE-003 selfdestruct call in upgradeable contract", async () => {
    const code = `
      pragma solidity ^0.8.20;
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract UpgradeableToken is Initializable {
        function kill() public {
          selfdestruct(payable(msg.sender));
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "UPGRADE-003")).toBe(true);
  });

  it("should detect UPGRADE-003 delegatecall call in upgradeable contract", async () => {
    const code = `
      pragma solidity ^0.8.20;
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract UpgradeableToken is Initializable {
        function forward(address target, bytes memory data) public {
          target.delegatecall(data);
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "UPGRADE-003")).toBe(true);
  });

  it("should NOT detect upgradeability errors for safe upgradeable patterns", async () => {
    const code = `
      pragma solidity ^0.8.20;
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      contract SafeUpgradeable is Initializable {
        uint256 public value;
        constructor() {
          _disableInitializers();
        }
        function initialize() public initializer {
          value = 100;
        }
      }
    `;
    const report = await engine.runAudit(code);
    expect(report.issues.some((i) => i.id === "UPGRADE-001")).toBe(false);
    expect(report.issues.some((i) => i.id === "UPGRADE-002")).toBe(false);
  });
});
});

