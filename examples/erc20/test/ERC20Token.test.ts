import { expect } from "chai";
import { ethers } from "hardhat";

describe("ERC20Token Example Tests", () => {
  it("should deploy and mint initial supply", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ERC20Token");
    const token = await Factory.deploy("VibeToken", "VIBE", 1000000);
    await token.waitForDeployment();

    expect(await token.name()).to.equal("VibeToken");
    expect(await token.balanceOf(owner.address)).to.equal(
      ethers.parseUnits("1000000", 18),
    );
  });
});
