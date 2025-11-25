const hre = require("hardhat");

async function main() {
  const ethers = hre.ethers;

  console.log("🚀 Deploying ArcFlowV25SwapRouter...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // 👉 SET THESE BEFORE DEPLOYING
  const FACTORY_ADDRESS = "0xYourFactoryAddressHere";
  const WETH_ADDRESS = "0x911b4000D3422F482F4062a913885f7b035382Df";

  console.log("Using Factory:", FACTORY_ADDRESS);
  console.log("Using WETH:", WETH_ADDRESS);

  console.log("\n⏳ Deploying router...");
  const Router = await ethers.getContractFactory("ArcFlowV25SwapRouter");
  const router = await Router.deploy(FACTORY_ADDRESS, WETH_ADDRESS);

  await router.waitForDeployment();
  const routerAddress = await router.getAddress();

  console.log("\n✅ ArcFlowV25SwapRouter deployed successfully!");
  console.log("Router address:", routerAddress);
  console.log("Transaction:", router.deploymentTransaction()?.hash);

  console.log("\n🔍 View on explorer:");
  console.log(`https://testnet.arcscan.app/address/${routerAddress}`);

  console.log("\n📝 Add to .env:");
  console.log(`NEXT_PUBLIC_ROUTER_CONTRACT=${routerAddress}`);

  console.log("\n⏳ Waiting for confirmations...");
  await router.deploymentTransaction()?.wait(5);

  console.log("\n🎉 Router deployment confirmed!");

  console.log("\n📌 Verify with:");
  console.log(
    `npx hardhat verify --network arcTestnet ${routerAddress} "${FACTORY_ADDRESS}" "${WETH_ADDRESS}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
