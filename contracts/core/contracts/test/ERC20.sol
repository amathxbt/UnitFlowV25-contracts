pragma solidity =0.5.16;

import '../ArcFlowV25ERC20.sol';

contract ERC20 is ArcFlowV25ERC20 {
    constructor(uint _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
