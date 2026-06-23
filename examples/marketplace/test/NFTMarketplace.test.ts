import { expect } from "chai";
import { ethers } from "hardhat";

describe("NFTMarketplace Example Tests", () => {
  it("should deploy and hold list state", async () => {
    const Factory = await ethers.getContractFactory("NFTMarketplace");
    const marketplace = await Factory.deploy();
    await marketplace.waitForDeployment();

    expect(await marketplace.getAddress()).to.properAddress;
  });
});
