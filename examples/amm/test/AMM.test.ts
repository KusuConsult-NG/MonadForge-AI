import { expect } from "chai";
import { ethers } from "hardhat";

describe("AMM Example Tests", () => {
  it("should deploy AMM pair successfully", async () => {
    const TokenFactory = await ethers.getContractFactory("ERC20Token");
    const token0 = await TokenFactory.deploy("TokenA", "TKNA", 1000000);
    const token1 = await TokenFactory.deploy("TokenB", "TKNB", 1000000);

    const AMMFactory = await ethers.getContractFactory("AMM");
    const amm = await AMMFactory.deploy(
      await token0.getAddress(),
      await token1.getAddress(),
    );
    await amm.waitForDeployment();

    expect(await amm.token0()).to.equal(await token0.getAddress());
    expect(await amm.token1()).to.equal(await token1.getAddress());
  });
});
