import { TemplateEngine } from "../src/index";

describe("TemplateEngine Unit Tests", () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it("should generate ERC20 token project", async () => {
    const project = await engine.generateProject("MyToken", "MTK", "erc20", {
      supply: "500",
    });
    expect(project.contracts["contracts/MyToken.sol"]).toContain(
      "contract MyToken is ERC20",
    );
    expect(project.contracts["contracts/MyToken.sol"]).toContain('"MTK"');
    expect(project.tests["test/MyToken.test.ts"]).toContain(
      'describe("MyToken"',
    );
    expect(project.readme).toContain("MyToken ERC20 Token");
  });

  it("should generate ERC721 token project", async () => {
    const project = await engine.generateProject("MyNFT", "MNFT", "erc721");
    expect(project.contracts["contracts/MyNFT.sol"]).toContain(
      "contract MyNFT is ERC721",
    );
    expect(project.contracts["contracts/MyNFT.sol"]).toContain('"MNFT"');
    expect(project.readme).toContain("MyNFT ERC721 NFT");
  });

  it("should generate Simple Staking project", async () => {
    const project = await engine.generateProject("Staking", "", "staking");
    expect(project.contracts["contracts/SimpleStaking.sol"]).toContain(
      "contract SimpleStaking",
    );
  });

  it("should generate DAO Treasury project", async () => {
    const project = await engine.generateProject("Treasury", "", "dao");
    expect(project.contracts["contracts/DAOTreasury.sol"]).toContain(
      "contract DAOTreasury",
    );
  });

  it("should reject unsupported templates", async () => {
    await expect(
      engine.generateProject("Foo", "BAR", "unsupported"),
    ).rejects.toThrow("Unsupported template type");
  });

  it("should generate ERC20 token project with default options", async () => {
    const project = await engine.generateProject("MyToken", "MTK", "erc20");
    expect(project.contracts["contracts/MyToken.sol"]).toContain(
      "contract MyToken is ERC20",
    );
  });

  it("should generate ERC1155 multi-token project with custom options", async () => {
    const project = await engine.generateProject("MultiToken", "", "erc1155", {
      uri: "ipfs://my-uri",
    });
    expect(project.contracts["contracts/MultiToken.sol"]).toContain(
      "contract MultiToken is ERC1155",
    );
    expect(project.contracts["contracts/MultiToken.sol"]).toContain(
      '"ipfs://my-uri"',
    );
  });

  it("should generate ERC1155 multi-token project with default options", async () => {
    const project = await engine.generateProject("MultiToken", "", "erc1155");
    expect(project.contracts["contracts/MultiToken.sol"]).toContain(
      "contract MultiToken is ERC1155",
    );
    expect(project.contracts["contracts/MultiToken.sol"]).toContain(
      "https://api.monadforge.json/multitoken/{id}",
    );
  });

  it("should generate Simple AMM project", async () => {
    const project = await engine.generateProject("MyAMM", "", "amm", {
      token0: "0x1111111111111111111111111111111111111111",
      token1: "0x2222222222222222222222222222222222222222",
    });
    expect(project.contracts["contracts/MyAMM.sol"]).toContain(
      "contract MyAMM is ERC20",
    );
    expect(project.contracts["contracts/MyAMM.sol"]).toContain("addLiquidity(");
    expect(project.contracts["contracts/MyAMM.sol"]).toContain("swap(");
    expect(project.tests["test/MyAMM.test.ts"]).toContain(
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("should generate Simple AMM project with defaults", async () => {
    const project = await engine.generateProject("MyAMM", "", "amm");
    expect(project.contracts["contracts/MyAMM.sol"]).toContain(
      "contract MyAMM is ERC20",
    );
  });

  it("should generate upgradeable ERC20 token project when upgradeable option is set", async () => {
    const project = await engine.generateProject("MyToken", "MTK", "erc20", {
      upgradeable: true,
      supply: "500",
    });
    expect(project.contracts["contracts/MyToken.sol"]).toContain(
      "contract MyToken is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable",
    );
    expect(project.contracts["contracts/MyToken.sol"]).toContain(
      "_disableInitializers()",
    );
    expect(project.tests["test/MyToken.test.ts"]).toContain(
      "MyToken Upgradeable",
    );
    expect(project.tests["test/MyToken.test.ts"]).toContain(
      'ethers.getContractFactory("ERC1967Proxy")',
    );
    expect(project.readme).toContain("MyToken Upgradeable ERC20 Token");
  });
});
