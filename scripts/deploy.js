const hre = require("hardhat");

async function main() {
  const ethers = hre.ethers;
  console.log("Deploying ArcFlowNFT to Arc Testnet...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "USDC");

  // Base URI for NFT metadata (can be updated later via setBaseURI)
  const baseURI = "ipfs://QmArcFlowNFT/";

  console.log("\nDeploying ArcFlowNFT contract...");
  const ArcFlowNFT = await ethers.getContractFactory("ArcFlowNFT");
  const nft = await ArcFlowNFT.deploy(baseURI);

  await nft.waitForDeployment();
  const contractAddress = await nft.getAddress();

  console.log("\n✅ ArcFlowNFT deployed successfully!");
  console.log("Contract address:", contractAddress);
  console.log("Base URI:", baseURI);
  console.log("\nTransaction hash:", nft.deploymentTransaction()?.hash);
  console.log("\nView on ArcScan:");
  console.log(`https://testnet.arcscan.app/address/${contractAddress}`);

  console.log("\n📝 Save this address to your .env.local file:");
  console.log(`NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=${contractAddress}`);

  console.log("\n⏳ Waiting for block confirmations...");
  await nft.deploymentTransaction()?.wait(5);

  console.log("\n✅ Contract deployment confirmed!");
  console.log("\nTo verify the contract, run:");
  console.log(`npx hardhat verify --network arcTestnet ${contractAddress} "${baseURI}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
