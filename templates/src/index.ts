import {
  ITemplateEngine,
  GeneratedProject,
  createLogger,
} from "@monadforge/sdk";

const logger = createLogger("TemplateEngine");

export class TemplateEngine implements ITemplateEngine {
  public async generateProject(
    name: string,
    symbol: string,
    templateType: string,
    options?: Record<string, any>,
  ): Promise<GeneratedProject> {
    logger.info(`Generating template project: ${templateType}`, {
      operation: "generateProject",
    });
    const normalizedType = templateType.toLowerCase();

    switch (normalizedType) {
      case "erc20":
        return this.generateERC20(
          name,
          symbol,
          options?.supply || "1000000",
          options?.upgradeable,
        );
      case "erc721":
        return this.generateERC721(name, symbol);
      case "erc1155":
        return this.generateERC1155(
          name,
          symbol,
          options?.uri ||
            `https://api.monadforge.json/${name.toLowerCase()}/{id}`,
        );
      case "staking":
        return this.generateStaking(
          options?.rewardToken || "0x0",
          options?.stakingToken || "0x0",
        );
      case "dao":
        return this.generateDAOTreasury();
      case "amm":
        return this.generateAMM(
          name,
          options?.token0 || "0x0000000000000000000000000000000000000001",
          options?.token1 || "0x0000000000000000000000000000000000000002",
        );
      default:
        throw new Error(`Unsupported template type: ${templateType}`);
    }
  }

  private generateERC20(
    name: string,
    symbol: string,
    supply: string,
    upgradeable?: boolean,
  ): GeneratedProject {
    if (upgradeable) {
      const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract ${name} is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) initializer public {
        __ERC20_init("${name}", "${symbol}");
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        _mint(initialOwner, ${supply} * 10 ** decimals());
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyOwner
        override
    {}
}
`;

      const testCode = `import { expect } from "chai";
import { ethers } from "hardhat";

describe("${name} Upgradeable", function () {
  it("Should deploy via proxy and mint initial supply", async function () {
    const [owner] = await ethers.getSigners();
    
    const TokenImpl = await ethers.getContractFactory("${name}");
    const impl = await TokenImpl.deploy();
    await impl.waitForDeployment();
    const implAddress = await impl.getAddress();
    
    const initData = impl.interface.encodeFunctionData("initialize", [owner.address]);
    
    const Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await Proxy.deploy(implAddress, initData);
    await proxy.waitForDeployment();
    
    const token = TokenImpl.attach(await proxy.getAddress()) as any;
    
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseUnits("${supply}", 18));
  });
});
`;

      const deployScript = `import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  
  console.log("Deploying implementation contract...");
  const TokenImpl = await ethers.getContractFactory("${name}");
  const impl = await TokenImpl.deploy();
  await impl.waitForDeployment();
  const implAddress = await impl.getAddress();
  console.log("Implementation deployed to:", implAddress);
  
  console.log("Deploying ERC1967Proxy contract...");
  const initData = impl.interface.encodeFunctionData("initialize", [owner.address]);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(implAddress, initData);
  await proxy.waitForDeployment();
  
  console.log("Proxy deployed to:", await proxy.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

      return {
        contracts: {
          [`contracts/${name}.sol`]: solidityCode,
        },
        tests: {
          [`test/${name}.test.ts`]: testCode,
        },
        deploymentScripts: {
          [`scripts/deploy.ts`]: deployScript,
        },
        readme: `# ${name} Upgradeable ERC20 Token\nGenerated via MonadForge.`,
        envExample: `PRIVATE_KEY=`,
      };
    }

    const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is ERC20, Ownable {
    constructor(uint256 initialSupply) ERC20("${name}", "${symbol}") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }
}
`;

    const testCode = `import { expect } from "chai";
import { ethers } from "hardhat";

describe("${name}", function () {
  it("Should deploy and mint total supply to owner", async function () {
    const [owner] = await ethers.getSigners();
    const token = await ethers.deployContract("${name}", [${supply}]);
    await token.waitForDeployment();
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseUnits("${supply}", 18));
  });
});
`;

    const deployScript = `import { ethers } from "hardhat";

async function main() {
  const token = await ethers.deployContract("${name}", [${supply}]);
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

    return {
      contracts: {
        [`contracts/${name}.sol`]: solidityCode,
      },
      tests: {
        [`test/${name}.test.ts`]: testCode,
      },
      deploymentScripts: {
        [`scripts/deploy.ts`]: deployScript,
      },
      readme: `# ${name} ERC20 Token\nGenerated via MonadForge.`,
      envExample: `PRIVATE_KEY=`,
    };
  }

  private generateERC721(name: string, symbol: string): GeneratedProject {
    const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("${name}", "${symbol}") Ownable(msg.sender) {}

    function safeMint(address to) public onlyOwner {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }
}
`;

    const testCode = `import { expect } from "chai";
import { ethers } from "hardhat";

describe("${name}", function () {
  it("Should deploy and allow owner to safeMint", async function () {
    const [owner, otherAccount] = await ethers.getSigners();
    const nft = await ethers.deployContract("${name}");
    await nft.waitForDeployment();
    await nft.safeMint(otherAccount.address);
    expect(await nft.ownerOf(0)).to.equal(otherAccount.address);
  });
});
`;

    const deployScript = `import { ethers } from "hardhat";

async function main() {
  const nft = await ethers.deployContract("${name}");
  await nft.waitForDeployment();
  console.log("NFT deployed to:", await nft.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

    return {
      contracts: {
        [`contracts/${name}.sol`]: solidityCode,
      },
      tests: {
        [`test/${name}.test.ts`]: testCode,
      },
      deploymentScripts: {
        [`scripts/deploy.ts`]: deployScript,
      },
      readme: `# ${name} ERC721 NFT\nGenerated via MonadForge.`,
      envExample: `PRIVATE_KEY=`,
    };
  }

  private generateStaking(
    rewardToken: string,
    stakingToken: string,
  ): GeneratedProject {
    const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SimpleStaking is ReentrancyGuard {
    IERC20 public stakingToken;
    IERC20 public rewardToken;
    
    mapping(address => uint256) public stakedBalances;

    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        stakingToken.transferFrom(msg.sender, address(this), amount);
        stakedBalances[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0 && stakedBalances[msg.sender] >= amount, "Invalid withdraw");
        stakedBalances[msg.sender] -= amount;
        stakingToken.transfer(msg.sender, amount);
    }
}
`;

    return {
      contracts: {
        "contracts/SimpleStaking.sol": solidityCode,
      },
      tests: {},
      deploymentScripts: {},
      readme: `# Simple Staking Contract\nGenerated via MonadForge.`,
      envExample: ``,
    };
  }

  private generateDAOTreasury(): GeneratedProject {
    const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DAOTreasury is Ownable {
    constructor() Ownable(msg.sender) {}

    receive() external payable {}

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient treasury funds");
        to.transfer(amount);
    }
}
`;

    return {
      contracts: {
        "contracts/DAOTreasury.sol": solidityCode,
      },
      tests: {},
      deploymentScripts: {},
      readme: `# DAO Treasury Contract\nGenerated via MonadForge.`,
      envExample: ``,
    };
  }

  private generateERC1155(
    name: string,
    symbol: string,
    uri: string,
  ): GeneratedProject {
    const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is ERC1155, Ownable {
    constructor() ERC1155("${uri}") Ownable(msg.sender) {}

    function setURI(string memory newuri) public onlyOwner {
        _setURI(newuri);
    }

    function mint(address account, uint256 id, uint256 amount, bytes memory data) public onlyOwner {
        _mint(account, id, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) public onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }
}
`;

    const testCode = `import { expect } from "chai";
import { ethers } from "hardhat";

describe("${name}", function () {
  it("Should deploy and allow owner to mint tokens", async function () {
    const [owner, otherAccount] = await ethers.getSigners();
    const token = await ethers.deployContract("${name}");
    await token.waitForDeployment();
    await token.mint(otherAccount.address, 1, 100, "0x");
    expect(await token.balanceOf(otherAccount.address, 1)).to.equal(100);
  });
});
`;

    const deployScript = `import { ethers } from "hardhat";

async function main() {
  const token = await ethers.deployContract("${name}");
  await token.waitForDeployment();
  console.log("MultiToken deployed to:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

    return {
      contracts: {
        [`contracts/${name}.sol`]: solidityCode,
      },
      tests: {
        [`test/${name}.test.ts`]: testCode,
      },
      deploymentScripts: {
        [`scripts/deploy.ts`]: deployScript,
      },
      readme: `# ${name} ERC1155 MultiToken\nGenerated via MonadForge.`,
      envExample: `PRIVATE_KEY=`,
    };
  }

  private generateAMM(
    name: string,
    token0: string,
    token1: string,
  ): GeneratedProject {
    const solidityCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ${name} is ERC20 {
    IERC20 public immutable token0;
    IERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;

    constructor(address _token0, address _token1) ERC20("MonadForge LP Share", "MF-LP") {
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
    }

    function addLiquidity(uint256 amount0, uint256 amount1) external returns (uint256 shares) {
        token0.transferFrom(msg.sender, address(this), amount0);
        token1.transferFrom(msg.sender, address(this), amount1);

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            shares = _sqrt(amount0 * amount1);
        } else {
            shares = _min((amount0 * _totalSupply) / reserve0, (amount1 * _totalSupply) / reserve1);
        }

        require(shares > 0, "Zero shares minted");
        _mint(msg.sender, shares);

        _updateReserves();
        return shares;
    }

    function removeLiquidity(uint256 shares) external returns (uint256 amount0, uint256 amount1) {
        require(shares > 0 && balanceOf(msg.sender) >= shares, "Invalid shares");
        uint256 _totalSupply = totalSupply();

        amount0 = (shares * reserve0) / _totalSupply;
        amount1 = (shares * reserve1) / _totalSupply;

        _burn(msg.sender, shares);

        token0.transfer(msg.sender, amount0);
        token1.transfer(msg.sender, amount1);

        _updateReserves();
        return (amount0, amount1);
    }

    function swap(address tokenIn, uint256 amountIn) external returns (uint256 amountOut) {
        require(tokenIn == address(token0) || tokenIn == address(token1), "Invalid token");
        require(amountIn > 0, "Zero amount");

        bool isToken0 = tokenIn == address(token0);
        IERC20 _tokenIn = isToken0 ? token0 : token1;
        IERC20 _tokenOut = isToken0 ? token1 : token0;
        uint256 _reserveIn = isToken0 ? reserve0 : reserve1;
        uint256 _reserveOut = isToken0 ? reserve1 : reserve0;

        _tokenIn.transferFrom(msg.sender, address(this), amountIn);

        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * _reserveOut) / ((_reserveIn * 1000) + amountInWithFee);

        require(amountOut > 0, "Insufficient output amount");
        _tokenOut.transfer(msg.sender, amountOut);

        _updateReserves();
        return amountOut;
    }

    function _updateReserves() internal {
        reserve0 = token0.balanceOf(address(this));
        reserve1 = token1.balanceOf(address(this));
    }

    function _min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
`;

    const testCode = `import { expect } from "chai";
import { ethers } from "hardhat";

describe("${name}", function () {
  it("Should deploy with token0 and token1", async function () {
    const amm = await ethers.deployContract("${name}", [
      "${token0}",
      "${token1}"
    ]);
    await amm.waitForDeployment();
    expect(await amm.token0()).to.equal("${token0}");
    expect(await amm.token1()).to.equal("${token1}");
  });
});
`;

    const deployScript = `import { ethers } from "hardhat";

async function main() {
  const amm = await ethers.deployContract("${name}", [
    "${token0}",
    "${token1}"
  ]);
  await amm.waitForDeployment();
  console.log("AMM deployed to:", await amm.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

    return {
      contracts: {
        [`contracts/${name}.sol`]: solidityCode,
      },
      tests: {
        [`test/${name}.test.ts`]: testCode,
      },
      deploymentScripts: {
        [`scripts/deploy.ts`]: deployScript,
      },
      readme: `# ${name} Constant-Product AMM\nGenerated via MonadForge.`,
      envExample: `PRIVATE_KEY=`,
    };
  }
}
export default TemplateEngine;
