// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./SchnorrVerifier.sol";
import "./BTXVerifier.sol";

interface IAMM {
    function tokenA() external view returns (address);
    function tokenB() external view returns (address);
    function swap(uint256 amountIn, address tokenIn, address to, uint256 minAmountOut)
        external
        returns (uint256);
}

/// @title EncryptedPool — BTX-powered encrypted order settlement layer.
/// @notice NOT an AMM itself. Orchestrates:
///           - encrypted order submission (Schnorr NIZK verified on-chain)
///           - escrow of input tokens
///           - epoch bookkeeping (10s default)
///           - decryptor committee integration (σ_j submissions → aggregate pairing)
///           - plaintext binding verification (keccak256 against commitment)
///           - random execution order (blockhash-seeded shuffle)
///           - swap dispatch to SealedAMM
///           - refund path after timeout
contract EncryptedPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------

    struct Epoch {
        uint64 startTime;
        uint64 endTime;
        uint32 orderCount;
        bool closed;
        bool executed;
    }

    struct EncryptedOrder {
        address user;
        address depositToken;
        uint256 depositAmount;
        bytes32 orderHash;
        bool executed;
        bool refunded;
    }

    /// @notice Plaintext order supplied by the combiner after off-chain BTX decryption.
    struct DecryptedOrder {
        uint32 orderIndex; // 0-indexed position within the epoch
        address user;
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        uint256 minAmountOut;
        uint256 nonce;
    }

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    IAMM public immutable amm;
    BTXVerifier public immutable btxVerifier;
    SchnorrVerifier public immutable schnorr;

    address public immutable tokenA;
    address public immutable tokenB;

    uint256 public immutable epochDuration;
    uint256 public immutable refundTimeout;

    uint256 public currentEpochId;
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(uint32 => EncryptedOrder)) public orders; // [epochId][orderIndex]
    mapping(uint256 => bytes[]) public ct1ByEpoch;                        // ct_1 per slot, 1-indexed via slot = index+1
    mapping(bytes32 => bool) public executedHashes;                       // replay protection

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event EpochStarted(uint256 indexed epochId, uint64 startTime, uint64 endTime);
    event EpochClosed(uint256 indexed epochId, uint32 orderCount);
    event OrderSubmitted(
        uint256 indexed epochId,
        uint32 indexed orderIndex,
        address indexed user,
        bytes ct_1,
        bytes ct_2,
        bytes pi_R,
        bytes32 pi_s,
        bytes aes_ct,
        bytes32 orderHash
    );
    event SwapExecuted(
        uint256 indexed epochId,
        uint32 indexed orderIndex,
        address indexed user,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut
    );
    event RefundClaimed(uint256 indexed epochId, uint32 indexed orderIndex, address indexed user, uint256 amount);
    event BatchExecuted(uint256 indexed epochId, uint32 successCount, uint32 failCount);

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(
        address _amm,
        address _btxVerifier,
        address _schnorr,
        uint256 _epochDuration,
        uint256 _refundTimeout
    ) {
        require(_amm != address(0) && _btxVerifier != address(0) && _schnorr != address(0), "EP: zero addr");
        require(_epochDuration > 0 && _refundTimeout > 0, "EP: bad timings");

        amm = IAMM(_amm);
        btxVerifier = BTXVerifier(_btxVerifier);
        schnorr = SchnorrVerifier(_schnorr);

        tokenA = IAMM(_amm).tokenA();
        tokenB = IAMM(_amm).tokenB();
        epochDuration = _epochDuration;
        refundTimeout = _refundTimeout;

        // Bootstrap epoch 1.
        currentEpochId = 1;
        Epoch storage e = epochs[1];
        e.startTime = uint64(block.timestamp);
        e.endTime = uint64(block.timestamp + _epochDuration);
        emit EpochStarted(1, e.startTime, e.endTime);
    }

    // ---------------------------------------------------------------
    // Submit encrypted order
    // ---------------------------------------------------------------

    function submitEncryptedOrder(
        bytes calldata ct_1,
        bytes calldata ct_2,
        bytes calldata pi_R,
        bytes32 pi_s,
        bytes calldata aes_ct,
        bytes32 orderHash,
        uint256 depositAmount,
        address depositToken
    ) external nonReentrant {
        require(ct_1.length == 128, "EP: ct_1 length");
        require(ct_2.length == 576, "EP: ct_2 length");
        require(pi_R.length == 128, "EP: pi_R length");
        require(depositAmount > 0, "EP: zero deposit");
        require(depositToken == tokenA || depositToken == tokenB, "EP: bad token");
        require(!executedHashes[orderHash], "EP: replay");

        // On-chain NIZK filter. Invalid → revert BEFORE taking escrow.
        require(schnorr.verify(ct_1, pi_R, pi_s), "EP: invalid NIZK");

        _rolloverIfExpired();
        uint256 epochId = currentEpochId;
        Epoch storage epoch = epochs[epochId];
        require(!epoch.closed, "EP: epoch closed");

        IERC20(depositToken).safeTransferFrom(msg.sender, address(this), depositAmount);

        uint32 orderIndex = epoch.orderCount;
        orders[epochId][orderIndex] = EncryptedOrder({
            user: msg.sender,
            depositToken: depositToken,
            depositAmount: depositAmount,
            orderHash: orderHash,
            executed: false,
            refunded: false
        });
        epoch.orderCount = orderIndex + 1;
        ct1ByEpoch[epochId].push(ct_1);

        emit OrderSubmitted(epochId, orderIndex, msg.sender, ct_1, ct_2, pi_R, pi_s, aes_ct, orderHash);
    }

    // ---------------------------------------------------------------
    // Epoch management
    // ---------------------------------------------------------------

    function closeEpoch() external {
        _rolloverIfExpired();
    }

    function _rolloverIfExpired() internal {
        uint256 epochId = currentEpochId;
        Epoch storage e = epochs[epochId];
        if (!e.closed && block.timestamp >= e.endTime) {
            e.closed = true;
            emit EpochClosed(epochId, e.orderCount);

            uint256 nextId = epochId + 1;
            Epoch storage n = epochs[nextId];
            n.startTime = uint64(block.timestamp);
            n.endTime = uint64(block.timestamp + epochDuration);
            currentEpochId = nextId;
            emit EpochStarted(nextId, n.startTime, n.endTime);
        }
    }

    // ---------------------------------------------------------------
    // Submit decrypted batch (combiner)
    // ---------------------------------------------------------------

    /// @notice Combiner calls this after BTX threshold decryption + AES unwrap.
    ///         Verifies (a) hash binding per slot, (b) aggregate pairing check,
    ///         then executes swaps in a random order.
    /// @param epochId        epoch identifier
    /// @param decrypted      plaintext orders; ordered by orderIndex or any order — contract
    ///                       builds U/ct_1_list from decrypted[i].orderIndex.
    /// @param V              committee subset (|V| == T_PLUS_1); passed to BTXVerifier.
    function submitDecryptedBatch(
        uint256 epochId,
        DecryptedOrder[] calldata decrypted,
        uint8[] calldata V
    ) external nonReentrant {
        Epoch storage epoch = epochs[epochId];
        require(epoch.closed, "EP: epoch not closed");
        require(!epoch.executed, "EP: already executed");
        require(decrypted.length > 0, "EP: empty batch");
        require(decrypted.length <= epoch.orderCount, "EP: too many orders");

        // Build U (1-indexed slot list) and ct_1_list from decrypted[].orderIndex.
        uint256[] memory U = new uint256[](decrypted.length);
        bytes[] memory ct1List = new bytes[](decrypted.length);
        bytes[] storage epochCt1 = ct1ByEpoch[epochId];

        for (uint256 i = 0; i < decrypted.length; i++) {
            DecryptedOrder calldata d = decrypted[i];
            require(d.orderIndex < epoch.orderCount, "EP: bad index");
            EncryptedOrder storage stored = orders[epochId][d.orderIndex];
            require(!stored.executed && !stored.refunded, "EP: slot settled");
            require(d.user == stored.user, "EP: user mismatch");

            // Hash binding: keccak256(plaintext fields) must equal commitment.
            bytes32 computed = keccak256(
                abi.encode(d.user, d.tokenIn, d.amountIn, d.tokenOut, d.minAmountOut, d.nonce)
            );
            require(computed == stored.orderHash, "EP: hash mismatch");
            require(!executedHashes[computed], "EP: replay");

            U[i] = uint256(d.orderIndex) + 1; // 1-indexed
            ct1List[i] = epochCt1[d.orderIndex];
        }

        // Aggregate pairing check. Reverts on failure → whole batch aborts → refunds via timeout.
        btxVerifier.combineAndVerify(epochId, V, ct1List, U);

        // Random execution order (Fisher-Yates with blockhash seed).
        uint256 seed = uint256(
            keccak256(abi.encode(blockhash(block.number - 1), block.prevrandao, epochId))
        );
        uint32[] memory order = _shuffle(uint32(decrypted.length), seed);

        uint32 successCount = 0;
        uint32 failCount = 0;
        for (uint256 i = 0; i < order.length; i++) {
            DecryptedOrder calldata d = decrypted[order[i]];
            EncryptedOrder storage stored = orders[epochId][d.orderIndex];
            executedHashes[stored.orderHash] = true;

            (bool ok, uint256 amountOut) = _tryExecute(d, stored);
            if (ok) {
                stored.executed = true;
                successCount += 1;
                emit SwapExecuted(
                    epochId, d.orderIndex, d.user, d.tokenIn, d.amountIn, d.tokenOut, amountOut
                );
            } else {
                stored.refunded = true;
                IERC20(stored.depositToken).safeTransfer(stored.user, stored.depositAmount);
                failCount += 1;
                emit RefundClaimed(epochId, d.orderIndex, stored.user, stored.depositAmount);
            }
        }

        epoch.executed = true;
        emit BatchExecuted(epochId, successCount, failCount);
    }

    function _tryExecute(DecryptedOrder calldata d, EncryptedOrder storage stored)
        internal
        returns (bool ok, uint256 amountOut)
    {
        // Validation: tokens, amountIn vs deposit, token pair.
        if (d.tokenIn != tokenA && d.tokenIn != tokenB) return (false, 0);
        if (d.tokenOut != tokenA && d.tokenOut != tokenB) return (false, 0);
        if (d.tokenIn == d.tokenOut) return (false, 0);
        if (d.tokenIn != stored.depositToken) return (false, 0);
        if (d.amountIn == 0 || d.amountIn > stored.depositAmount) return (false, 0);

        IERC20(d.tokenIn).forceApprove(address(amm), d.amountIn);
        try amm.swap(d.amountIn, d.tokenIn, d.user, d.minAmountOut) returns (uint256 out) {
            amountOut = out;
            ok = true;
            // Return any excess deposit (e.g., user deposited 100 but swapped only 50).
            uint256 excess = stored.depositAmount - d.amountIn;
            if (excess > 0) {
                IERC20(stored.depositToken).safeTransfer(d.user, excess);
            }
        } catch {
            IERC20(d.tokenIn).forceApprove(address(amm), 0); // clear stale approval
            ok = false;
        }
    }

    // ---------------------------------------------------------------
    // Refund
    // ---------------------------------------------------------------

    function claimRefund(uint256 epochId, uint32 orderIndex) external nonReentrant {
        Epoch storage epoch = epochs[epochId];
        EncryptedOrder storage stored = orders[epochId][orderIndex];
        require(stored.user == msg.sender, "EP: not your order");
        require(!stored.executed && !stored.refunded, "EP: already settled");
        require(epoch.closed, "EP: epoch not closed");
        require(block.timestamp >= uint256(epoch.endTime) + refundTimeout, "EP: too early");

        stored.refunded = true;
        IERC20(stored.depositToken).safeTransfer(msg.sender, stored.depositAmount);
        emit RefundClaimed(epochId, orderIndex, msg.sender, stored.depositAmount);
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------

    function getCt1(uint256 epochId, uint32 orderIndex) external view returns (bytes memory) {
        return ct1ByEpoch[epochId][orderIndex];
    }

    function getOrderCount(uint256 epochId) external view returns (uint32) {
        return epochs[epochId].orderCount;
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    function _shuffle(uint32 n, uint256 seed) internal pure returns (uint32[] memory arr) {
        arr = new uint32[](n);
        for (uint32 i = 0; i < n; i++) arr[i] = i;
        for (uint32 i = n; i > 1; i--) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % i;
            (arr[i - 1], arr[j]) = (arr[j], arr[i - 1]);
        }
    }
}
