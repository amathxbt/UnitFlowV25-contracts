// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ArcFlowNFT is ERC721, Ownable {
    uint256 private _tokenIds;

    enum NFTType { GENESIS, ACTIVITY }
    
    struct NFTMetadata {
        NFTType nftType;
        uint256 mintedAt;
        address minter;
    }

    mapping(uint256 => NFTMetadata) public nftMetadata;
    mapping(address => mapping(NFTType => bool)) public hasMinted;
    mapping(address => uint256) public lastActivityMintTime;
    mapping(address => uint256) public userPoints;
    
    // Track individual user counts
    mapping(address => uint256) public userGenesisCount;
    mapping(address => uint256) public userActivityCount;
    
    // Track total supply by type
    uint256 public totalGenesisSupply;
    uint256 public totalActivitySupply;

    string private _baseTokenURI;

    event NFTMinted(address indexed minter, uint256 indexed tokenId, NFTType nftType);
    event PointsAwarded(address indexed user, uint256 points);

    constructor(string memory baseURI) ERC721("ArcFlow NFT", "ARCNFT") Ownable(msg.sender) {
        _baseTokenURI = baseURI;
    }

    function mintGenesis() external {
        require(!hasMinted[msg.sender][NFTType.GENESIS], "Genesis NFT already minted");
        
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        
        _safeMint(msg.sender, newTokenId);
        
        nftMetadata[newTokenId] = NFTMetadata({
            nftType: NFTType.GENESIS,
            mintedAt: block.timestamp,
            minter: msg.sender
        });
        
        hasMinted[msg.sender][NFTType.GENESIS] = true;
        userGenesisCount[msg.sender] = 1; // Always 1 per user
        totalGenesisSupply++;
        
        // Award points for minting Genesis NFT
        userPoints[msg.sender] += 100;
        
        emit NFTMinted(msg.sender, newTokenId, NFTType.GENESIS);
        emit PointsAwarded(msg.sender, 100);
    }

    function mintActivity() external {
        require(hasMinted[msg.sender][NFTType.GENESIS], "Must mint Genesis NFT first");
        
        // Check if 24 hours have passed since last Activity NFT mint
        uint256 lastMintTime = lastActivityMintTime[msg.sender];
        require(
            lastMintTime == 0 || block.timestamp >= lastMintTime + 1 days,
            "Can only mint one Activity NFT per day"
        );
        
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        
        _safeMint(msg.sender, newTokenId);
        
        nftMetadata[newTokenId] = NFTMetadata({
            nftType: NFTType.ACTIVITY,
            mintedAt: block.timestamp,
            minter: msg.sender
        });
        
        hasMinted[msg.sender][NFTType.ACTIVITY] = true;
        lastActivityMintTime[msg.sender] = block.timestamp;
        userActivityCount[msg.sender]++;
        totalActivitySupply++;
        
        // Award points for minting Activity NFT
        userPoints[msg.sender] += 150;
        
        emit NFTMinted(msg.sender, newTokenId, NFTType.ACTIVITY);
        emit PointsAwarded(msg.sender, 150);
    }

    function awardPoints(address user, uint256 points) external onlyOwner {
        userPoints[user] += points;
        emit PointsAwarded(user, points);
    }

    function getUserNFTCount(address user) external view returns (uint256) {
        return balanceOf(user);
    }
    
    function getUserActivityCount(address user) external view returns (uint256) {
        return userActivityCount[user];
    }
    
    function getUserGenesisCount(address user) external view returns (uint256) {
        return userGenesisCount[user];
    }
    
    function getTotalGenesisSupply() external view returns (uint256) {
        return totalGenesisSupply;
    }
    
    function getTotalActivitySupply() external view returns (uint256) {
        return totalActivitySupply;
    }

    function hasUserMintedType(address user, NFTType nftType) external view returns (bool) {
        return hasMinted[user][nftType];
    }
    
    function isUserVerified(address user) external view returns (bool) {
        // User is verified if they have minted Genesis Pass
        return hasMinted[user][NFTType.GENESIS];
    }

    function canMintActivity(address user) external view returns (bool) {
        if (!hasMinted[user][NFTType.GENESIS]) {
            return false;
        }
        
        uint256 lastMintTime = lastActivityMintTime[user];
        return lastMintTime == 0 || block.timestamp >= lastMintTime + 1 days;
    }

    function getTimeUntilNextActivityMint(address user) external view returns (uint256) {
        uint256 lastMintTime = lastActivityMintTime[user];
        if (lastMintTime == 0) {
            return 0;
        }
        
        uint256 nextMintTime = lastMintTime + 1 days;
        if (block.timestamp >= nextMintTime) {
            return 0;
        }
        
        return nextMintTime - block.timestamp;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIds;
    }
}
