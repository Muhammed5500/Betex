// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 18-decimal mock MON for testnet. Open `mint` acts as faucet.
contract MockMON is ERC20 {
    constructor() ERC20("Mock MON", "MON") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
