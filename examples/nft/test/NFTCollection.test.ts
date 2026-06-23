import { expect } from "chai";
import { ethers } from "hardhat";

describe("NFTCollection Example Tests", () => {
  it("should deploy and mint NFT with tokenURI", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("NFTCollection");
    const nft = await Factory.deploy("VibeNFT", "VNFT");
    await nft.waitForDeployment();

    expect(await nft.name()).to.equal("VibeNFT");
    const tx = await nft.mint(owner.address, "ipfs://meta");
    await tx.wait();

    expect(await nft.ownerOf(0)).to.equal(owner.address);
    expect(await nft.tokenURI(0)).to.equal("ipfs://meta");
  });
});
