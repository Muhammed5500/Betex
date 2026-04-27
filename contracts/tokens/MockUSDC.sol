// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal mock USDC for testnet. Open `mint` acts as faucet.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
