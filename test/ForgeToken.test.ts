import { expect } from "chai";
import { ethers } from "hardhat";

describe("ForgeToken", function () {
  it("Should deploy and mint total supply to owner", async function () {
    const [owner] = await ethers.getSigners();
    const token = await ethers.deployContract("ForgeToken", [1000000]);
    await token.waitForDeployment();
    expect(await token.balanceOf(owner.address)).to.equal(
      ethers.parseUnits("1000000", 18),
    );
  });
});
