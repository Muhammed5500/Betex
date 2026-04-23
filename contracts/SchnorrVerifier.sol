// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./lib/BLS12381.sol";

/// @title SchnorrVerifier — on-chain NIZK verifier, byte-compatible with js/lib/schnorr.js.
/// @notice Statement: "I know r such that ct_1 = r · G_1".
///         c = SHA256(DOMAIN || G_1 || ct_1 || R) mod FR_ORDER
///         Accepts iff s · G_1 == R + c · ct_1 in G1.
contract SchnorrVerifier {
    bytes constant DOMAIN = "BTX-SCHNORR-V1";

    /// @param ct_1  G1 point in EIP-2537 128-byte format.
    /// @param R     G1 point in EIP-2537 128-byte format.
    /// @param s     Fr scalar as 32 big-endian bytes, already reduced mod FR_ORDER.
    function verify(
        bytes calldata ct_1,
        bytes calldata R,
        bytes32 s
    ) external view returns (bool) {
        if (ct_1.length != 128 || R.length != 128) return false;
        if (uint256(s) >= BLS12381.FR_ORDER) return false;

        bytes memory g1 = BLS12381.G1_GENERATOR();

        // c = H(DOMAIN || G_1 || ct_1 || R) mod FR_ORDER
        bytes32 digest = sha256(abi.encodePacked(DOMAIN, g1, ct_1, R));
        bytes32 c = bytes32(uint256(digest) % BLS12381.FR_ORDER);

        // LHS = s · G_1
        bytes memory lhs = BLS12381.g1ScalarMul(g1, s);

        // RHS = R + c · ct_1
        bytes memory cCt1 = BLS12381.g1ScalarMul(ct_1, c);
        bytes memory rhs = BLS12381.g1Add(R, cCt1);

        return keccak256(lhs) == keccak256(rhs);
    }
}
