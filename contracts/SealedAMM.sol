// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SealedAMM — constant-product AMM (Uniswap V2 style), gated to a single pool contract.
/// @notice x · y = k, 0.3% fee. No LP tokens; owner bootstraps and adds liquidity (MVP).
contract SealedAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable tokenA;
    address public immutable tokenB;
    uint256 public reserveA;
    uint256 public reserveB;

    address public owner;
    address public sealedPool;
    bool public initialized;

    uint256 public constant FEE_NUM = 3;       // 0.3% fee
    uint256 public constant FEE_DEN = 1000;

    event PoolInitialized(uint256 amountA, uint256 amountB);
    event LiquidityAdded(uint256 amountA, uint256 amountB);
    event Swap(address indexed recipient, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut);

    modifier onlyOwner() {
        require(msg.sender == owner, "SealedAMM: not owner");
        _;
    }

    modifier onlyPool() {
        require(msg.sender == sealedPool, "SealedAMM: not pool");
        _;
    }

    constructor(address _tokenA, address _tokenB) {
        require(_tokenA != address(0) && _tokenB != address(0) && _tokenA != _tokenB, "SealedAMM: bad tokens");
        tokenA = _tokenA;
        tokenB = _tokenB;
        owner = msg.sender;
    }

    function setSealedPool(address pool) external onlyOwner {
        require(sealedPool == address(0), "SealedAMM: pool set");
        require(pool != address(0), "SealedAMM: zero pool");
        sealedPool = pool;
    }

    function initialize(uint256 amountA, uint256 amountB) external onlyOwner {
        require(!initialized, "SealedAMM: initialized");
        require(amountA > 0 && amountB > 0, "SealedAMM: zero amount");
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);
        reserveA = amountA;
        reserveB = amountB;
        initialized = true;
        emit PoolInitialized(amountA, amountB);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external onlyOwner nonReentrant {
        require(initialized, "SealedAMM: not initialized");
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
        emit LiquidityAdded(amountA, amountB);
    }

    /// @notice amountOut for a given amountIn, applying 0.3% fee.
    function getAmountOut(uint256 amountIn, address tokenIn) public view returns (uint256) {
        require(initialized, "SealedAMM: not initialized");
        require(amountIn > 0, "SealedAMM: zero in");
        (uint256 rIn, uint256 rOut) = tokenIn == tokenA ? (reserveA, reserveB) : (reserveB, reserveA);
        require(tokenIn == tokenA || tokenIn == tokenB, "SealedAMM: bad token");
        uint256 amountInFee = amountIn * (FEE_DEN - FEE_NUM);
        return (amountInFee * rOut) / (rIn * FEE_DEN + amountInFee);
    }

    /// @notice Execute a swap. Caller must have approved `amountIn` of `tokenIn` for this contract.
    /// @dev Only the pool contract may call. Output is sent directly to `to`.
    function swap(
        uint256 amountIn,
        address tokenIn,
        address to,
        uint256 minAmountOut
    ) external onlyPool nonReentrant returns (uint256 amountOut) {
        require(initialized, "SealedAMM: not initialized");
        require(tokenIn == tokenA || tokenIn == tokenB, "SealedAMM: bad token");
        require(to != address(0), "SealedAMM: bad recipient");

        amountOut = getAmountOut(amountIn, tokenIn);
        require(amountOut >= minAmountOut, "SealedAMM: slippage");

        address tokenOut = tokenIn == tokenA ? tokenB : tokenA;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);

        if (tokenIn == tokenA) {
            reserveA += amountIn;
            reserveB -= amountOut;
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
        }

        emit Swap(to, tokenIn, amountIn, tokenOut, amountOut);
    }
}
