import { expect } from "chai";
import { ethers } from "hardhat";

describe("GovernorContract Example Tests", () => {
  it("should deploy GovernorContract successfully", async () => {
    // We mock votes token
    const [owner] = await ethers.getSigners();
    const TokenFactory = await ethers.getContractFactory("ERC20Token");
    const votesToken = await TokenFactory.deploy("GovToken", "GTKN", 1000000);
    await votesToken.waitForDeployment();

    const GovFactory = await ethers.getContractFactory("GovernorContract");
    const governor = await GovFactory.deploy(await votesToken.getAddress());
    await governor.waitForDeployment();

    expect(await governor.name()).to.equal("GovernorContract");
  });
});
