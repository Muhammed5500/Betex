// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Parameterised mintable ERC-20 used by Hardhat tests and local deploys.
///         Production deploys (Monad testnet) use Circle USDC + canonical WMON
///         instead, so this contract is intentionally limited to the test harness.
contract TestERC20 is ERC20 {
    uint8 private immutable _decimalsOverride;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimalsOverride = decimals_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimalsOverride;
    }
}
