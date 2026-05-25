# ArcFlow NFT Contract Deployment Guide

## Contract Updates

The updated `ArcFlowNFT.sol` contract includes the following new features:

### New State Variables
- `userGenesisCount`: Tracks Genesis Pass count per user (always 1 or 0)
- `userActivityCount`: Tracks Activity NFT count per user (can be multiple)
- `totalGenesisSupply`: Total number of Genesis Passes minted
- `totalActivitySupply`: Total number of Activity NFTs minted

### New Functions
- `getUserActivityCount(address user)`: Returns number of Activity NFTs minted by user
- `getUserGenesisCount(address user)`: Returns if user has Genesis Pass (1 or 0)
- `getTotalGenesisSupply()`: Returns total Genesis Passes minted globally
- `getTotalActivitySupply()`: Returns total Activity NFTs minted globally
- `isUserVerified(address user)`: Returns true if user has minted Genesis Pass

### Key Features
1. **Genesis Pass = Verification**: Owning a Genesis Pass means the user is verified (Discord + Twitter)
2. **Activity NFT Daily Limit**: Users can mint one Activity NFT per 24 hours
3. **Activity NFTs Tied to Genesis Pass**: Must have Genesis Pass to mint Activity NFTs
4. **Ranking Based on Activity NFT Count**: User rank is determined by number of Activity NFTs minted

## Deployment Steps

### Prerequisites
1. Install Hardhat or Foundry
2. Set up Arc Testnet RPC in your environment
3. Have testnet tokens for deployment

### Using Hardhat

1. Install dependencies:
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

2. Create `hardhat.config.js`:
```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    arcTestnet: {
      url: process.env.ARC_TESTNET_RPC_URL || "https://rpc-testnet.arc.xyz",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 1234, // Replace with actual Arc Testnet chain ID
    }
  }
};
```

3. Create deployment script `scripts/deploy.js`:
```javascript
const hre = require("hardhat");

async function main() {
  const baseURI = "ipfs://YOUR_METADATA_CID/"; // Update with your IPFS CID
  
  console.log("Deploying ArcFlowNFT contract...");
  
  const ArcFlowNFT = await hre.ethers.getContractFactory("ArcFlowNFT");
  const arcFlowNFT = await ArcFlowNFT.deploy(baseURI);
  
  await arcFlowNFT.waitForDeployment();
  
  const address = await arcFlowNFT.getAddress();
  console.log("ArcFlowNFT deployed to:", address);
  
  // Verify contract on block explorer (if supported)
  console.log("Waiting for block confirmations...");
  await arcFlowNFT.deploymentTransaction().wait(5);
  
  console.log("Verifying contract...");
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: [baseURI],
    });
  } catch (error) {
    console.log("Verification failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

4. Deploy:
```bash
npx hardhat run scripts/deploy.js --network arcTestnet
```

### Using Foundry

1. Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. Create `foundry.toml`:
```toml
[profile.default]
src = "contracts"
out = "out"
libs = ["node_modules"]
solc_version = "0.8.20"

[rpc_endpoints]
arc_testnet = "${ARC_TESTNET_RPC_URL}"
```

3. Deploy:
```bash
forge create contracts/ArcFlowNFT.sol:ArcFlowNFT \
  --rpc-url arc_testnet \
  --private-key $PRIVATE_KEY \
  --constructor-args "ipfs://YOUR_METADATA_CID/"
```

## Post-Deployment

1. **Update Frontend Environment Variables**:
   - Copy the deployed contract address
   - Update `.env.local`:
   ```
   NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0xYourDeployedContractAddress
   ```

2. **Test Contract Functions**:
   ```bash
   # Test Genesis Pass minting
   cast send $CONTRACT_ADDRESS "mintGenesis()" --rpc-url arc_testnet --private-key $PRIVATE_KEY
   
   # Check total supply
   cast call $CONTRACT_ADDRESS "getTotalGenesisSupply()" --rpc-url arc_testnet
   cast call $CONTRACT_ADDRESS "getTotalActivitySupply()" --rpc-url arc_testnet
   
   # Check user verification
   cast call $CONTRACT_ADDRESS "isUserVerified(address)" $USER_ADDRESS --rpc-url arc_testnet
   ```

3. **Verify Frontend Integration**:
   - Connect wallet to the application
   - Verify Genesis Pass minting works
   - Check that verification status is automatically set after Genesis Pass mint
   - Test Activity NFT minting with 24-hour cooldown
   - Verify Dashboard shows correct metrics

## Important Notes

- **Genesis Pass is One-Time**: Each address can only mint one Genesis Pass
- **Activity NFT Daily Limit**: Each address can mint one Activity NFT per 24 hours
- **Verification Proof**: Genesis Pass ownership = verified user (no separate OAuth needed)
- **Ranking System**: Based on Activity NFT count, not points
- **Total Supply Metrics**: Available for both Genesis Pass and Activity NFTs

## Contract Addresses (Arc Testnet)

| Contract | Address |
|---|---|
| ArcFlowV25Factory | `0xb7A910200EB187e94296FaE504FbdDC048aA22C9` |
| ArcFlowV25SwapRouter | `0xb71FCd6a9690A5356fff6C9c930818B0f04fE053` |
| ArcFlowV25LiquidityRouter | `0xB568839775e59a68818d181fc3f020d8A5Fd107A` |
| WUSDC | `0x911b4000D3422F482F4062a913885f7b035382Df` |

## ABI Export

The contract ABI is automatically included in `lib/contracts.ts`. After deployment, ensure the ABI matches the deployed contract.
