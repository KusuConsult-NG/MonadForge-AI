import { ethers } from "hardhat";

async function main() {
  const token = await ethers.deployContract("ForgeToken", [1000000]);
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
