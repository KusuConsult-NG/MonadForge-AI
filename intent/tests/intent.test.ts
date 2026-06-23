import { IntentEngine } from "../src/index";

describe("IntentEngine Unit Tests", () => {
  let engine: IntentEngine;

  beforeEach(() => {
    engine = new IntentEngine();
  });

  it("should parse ERC20 generation intent", async () => {
    const res = await engine.parse(
      "Create an ERC20 token called ForgeToken with symbol FORGE and 1000000 supply",
    );
    expect(res.type).toBe("generate");
    expect(res.domain).toBe("erc20");
    expect(res.params.name).toBe("ForgeToken");
    expect(res.params.symbol).toBe("FORGE");
    expect(res.params.supply).toBe("1000000");
  });

  it("should parse ERC721 generation intent", async () => {
    const res = await engine.parse("build a new NFT named CoolNFT");
    expect(res.type).toBe("generate");
    expect(res.domain).toBe("erc721");
    expect(res.params.name).toBe("CoolNFT");
  });

  it("should parse deploy intent", async () => {
    const res = await engine.parse("deploy contract my-token");
    expect(res.type).toBe("deploy");
    expect(res.params.projectId).toBe("my-token");
  });

  it("should parse audit intent", async () => {
    const res = await engine.parse("audit file contracts/MyToken.sol");
    expect(res.type).toBe("audit");
    expect(res.params.filePath).toBe("contracts/MyToken.sol");
  });

  it("should parse verify intent", async () => {
    const res = await engine.parse(
      "verify contract 0x1234567890123456789012345678901234567890 at contracts/Token.sol",
    );
    expect(res.type).toBe("verify");
    expect(res.params.contractAddress).toBe(
      "0x1234567890123456789012345678901234567890",
    );
    expect(res.params.filePath).toBe("contracts/Token.sol");
  });

  it("should parse mint intent", async () => {
    const res = await engine.parse(
      "mint 500 tokens to 0x1234567890123456789012345678901234567890",
    );
    expect(res.type).toBe("action");
    expect(res.params.action).toBe("mint");
    expect(res.params.amount).toBe("500");
    expect(res.params.to).toBe("0x1234567890123456789012345678901234567890");
  });

  it("should parse stake intent", async () => {
    const res = await engine.parse("stake 100 tokens");
    expect(res.type).toBe("action");
    expect(res.params.action).toBe("stake");
    expect(res.params.amount).toBe("100");
  });

  it("should parse swap intent", async () => {
    const res = await engine.parse(
      "swap token 0x1234567890123456789012345678901234567890 amount 10",
    );
    expect(res.type).toBe("action");
    expect(res.params.action).toBe("swap");
    expect(res.params.tokenIn).toBe(
      "0x1234567890123456789012345678901234567890",
    );
    expect(res.params.amountIn).toBe("10");
  });

  it("should parse transfer intent", async () => {
    const res = await engine.parse(
      "transfer 50 to 0x1234567890123456789012345678901234567890",
    );
    expect(res.type).toBe("action");
    expect(res.params.action).toBe("transfer");
    expect(res.params.amount).toBe("50");
    expect(res.params.to).toBe("0x1234567890123456789012345678901234567890");
  });

  it("should fallback to docs query if not matching", async () => {
    const res = await engine.parse("how does consensus work on Monad?");
    expect(res.type).toBe("docs");
    expect(res.params.query).toBe("how does consensus work on Monad?");
  });

  it("should parse deploy with default projectId", async () => {
    const res = await engine.parse("deploy");
    expect(res.type).toBe("deploy");
    expect(res.params.projectId).toBe("default-project");
  });

  it("should parse audit with default filePath", async () => {
    const res = await engine.parse("audit");
    expect(res.type).toBe("audit");
    expect(res.params.filePath).toBe("contracts/Token.sol");
  });

  it("should parse verify without filePath", async () => {
    const res = await engine.parse(
      "verify contract 0x1234567890123456789012345678901234567890",
    );
    expect(res.type).toBe("verify");
    expect(res.params.contractAddress).toBe(
      "0x1234567890123456789012345678901234567890",
    );
    expect(res.params.filePath).toBeUndefined();
  });

  it("should parse generate for different domains and fallbacks", async () => {
    const res1 = await engine.parse("generate erc1155");
    expect(res1.type).toBe("generate");
    expect(res1.domain).toBe("erc1155");
    expect(res1.params.name).toBe("ERC1155Token");

    const res2 = await engine.parse("generate staking");
    expect(res2.type).toBe("generate");
    expect(res2.domain).toBe("staking");
    expect(res2.params.name).toBe("STAKINGToken");

    const res3 = await engine.parse("generate dao");
    expect(res3.type).toBe("generate");
    expect(res3.domain).toBe("dao");
    expect(res3.params.name).toBe("DAOToken");

    const res4 = await engine.parse("generate amm");
    expect(res4.type).toBe("generate");
    expect(res4.domain).toBe("amm");
    expect(res4.params.name).toBe("AMMToken");

    const res5 = await engine.parse("generate unknown");
    expect(res5.type).toBe("generate");
    expect(res5.domain).toBe("unknown");
    expect(res5.params.name).toBe("ForgeToken");
  });
});
