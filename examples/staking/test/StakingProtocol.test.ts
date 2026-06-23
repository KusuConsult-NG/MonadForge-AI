import { expect } from "chai";
import { ethers } from "hardhat";

describe("StakingProtocol Example Tests", () => {
  it("should deploy and initialize staking pools", async () => {
    const TokenFactory = await ethers.getContractFactory("ERC20Token");
    const stToken = await TokenFactory.deploy("StakeToken", "STK", 1000000);
    const rwToken = await TokenFactory.deploy("RewardToken", "RWD", 1000000);

    const StakingFactory = await ethers.getContractFactory("StakingProtocol");
    const staking = await StakingFactory.deploy(
      await stToken.getAddress(),
      await rwToken.getAddress(),
    );
    await staking.waitForDeployment();

    expect(await staking.stakingToken()).to.equal(await stToken.getAddress());
  });
});
