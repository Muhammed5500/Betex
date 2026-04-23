// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BLS12-381 EIP-2537 precompile wrapper.
/// @notice All byte arrays follow the EIP-2537 uncompressed encoding:
///           - Fp field element: 64 bytes = 16 bytes zero padding + 48 BE bytes
///           - G1 point:         128 bytes = 2 × Fp  (x, y)
///           - G2 point:         256 bytes = 4 × Fp  (x.c0, x.c1, y.c0, y.c1)
///           - Fr scalar:        32 bytes BE (no padding)
library BLS12381 {
    // Precompile addresses per EIP-2537.
    address internal constant G1ADD          = address(0x0b);
    address internal constant G1MSM          = address(0x0c);
    address internal constant G2ADD          = address(0x0d);
    address internal constant G2MSM          = address(0x0e);
    address internal constant PAIRING_CHECK  = address(0x0f);
    address internal constant MAP_FP_TO_G1   = address(0x10);
    address internal constant MAP_FP2_TO_G2  = address(0x11);

    // BLS12-381 scalar field order (Fr).
    uint256 internal constant FR_ORDER =
        0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;

    /// @dev G1 generator in EIP-2537 128-byte encoding.
    function G1_GENERATOR() internal pure returns (bytes memory) {
        return
            hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0f"
            hex"c3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb"
            hex"0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4"
            hex"fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1";
    }

    /// @dev G2 generator in EIP-2537 256-byte encoding (c0 || c1 ordering).
    function G2_GENERATOR() internal pure returns (bytes memory) {
        return
            hex"00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051"
            hex"c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8"
            hex"0000000000000000000000000000000013e02b6052719f607dacd3a088274f65"
            hex"596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e"
            hex"000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351a"
            hex"adfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801"
            hex"000000000000000000000000000000000606c4a02ea734cc32acd2b02bc28b99"
            hex"cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be";
    }

    /// @dev -G2 precomputed. Useful for pairing-product checks that need to move
    ///      a term to the other side: `LHS · e(P, -G2) == 1  ⇔  LHS == e(P, G2)`.
    function G2_GENERATOR_NEG() internal pure returns (bytes memory) {
        return
            hex"00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051"
            hex"c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8"
            hex"0000000000000000000000000000000013e02b6052719f607dacd3a088274f65"
            hex"596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e"
            hex"000000000000000000000000000000000d1b3cc2c7027888be51d9ef691d77bc"
            hex"b679afda66c73f17f9ee3837a55024f78c71363275a75d75d86bab79f74782aa"
            hex"0000000000000000000000000000000013fa4d4a0ad8b1ce186ed5061789213d"
            hex"993923066dddaf1040bc3ff59f825c78df74f2d75467e25e0f55f8a00fa030ed";
    }

    // ---------------------------------------------------------------
    // G1 operations
    // ---------------------------------------------------------------

    /// @notice P + Q in G1.
    function g1Add(bytes memory a, bytes memory b) internal view returns (bytes memory) {
        require(a.length == 128 && b.length == 128, "BLS12381: invalid G1 length");
        bytes memory input = abi.encodePacked(a, b);
        (bool ok, bytes memory out) = G1ADD.staticcall(input);
        require(ok && out.length == 128, "BLS12381: G1ADD failed");
        return out;
    }

    /// @notice Multi-scalar multiplication in G1.
    /// @dev `pairs` is k × (G1_point || scalar) = k × 160 bytes.
    function g1MSM(bytes memory pairs) internal view returns (bytes memory) {
        require(pairs.length > 0 && pairs.length % 160 == 0, "BLS12381: invalid G1MSM input");
        (bool ok, bytes memory out) = G1MSM.staticcall(pairs);
        require(ok && out.length == 128, "BLS12381: G1MSM failed");
        return out;
    }

    /// @notice s · P in G1 (single-pair MSM).
    function g1ScalarMul(bytes memory point, bytes32 scalar) internal view returns (bytes memory) {
        require(point.length == 128, "BLS12381: invalid G1 length");
        bytes memory input = new bytes(160);
        for (uint256 i = 0; i < 128; i++) input[i] = point[i];
        for (uint256 i = 0; i < 32; i++) input[128 + i] = scalar[i];
        (bool ok, bytes memory out) = G1MSM.staticcall(input);
        require(ok && out.length == 128, "BLS12381: G1MSM failed");
        return out;
    }

    // ---------------------------------------------------------------
    // G2 operations
    // ---------------------------------------------------------------

    function g2Add(bytes memory a, bytes memory b) internal view returns (bytes memory) {
        require(a.length == 256 && b.length == 256, "BLS12381: invalid G2 length");
        bytes memory input = abi.encodePacked(a, b);
        (bool ok, bytes memory out) = G2ADD.staticcall(input);
        require(ok && out.length == 256, "BLS12381: G2ADD failed");
        return out;
    }

    function g2MSM(bytes memory pairs) internal view returns (bytes memory) {
        require(pairs.length > 0 && pairs.length % 288 == 0, "BLS12381: invalid G2MSM input");
        (bool ok, bytes memory out) = G2MSM.staticcall(pairs);
        require(ok && out.length == 256, "BLS12381: G2MSM failed");
        return out;
    }

    function g2ScalarMul(bytes memory point, bytes32 scalar) internal view returns (bytes memory) {
        require(point.length == 256, "BLS12381: invalid G2 length");
        bytes memory input = new bytes(288);
        for (uint256 i = 0; i < 256; i++) input[i] = point[i];
        for (uint256 i = 0; i < 32; i++) input[256 + i] = scalar[i];
        (bool ok, bytes memory out) = G2MSM.staticcall(input);
        require(ok && out.length == 256, "BLS12381: G2MSM failed");
        return out;
    }

    // ---------------------------------------------------------------
    // Pairing check
    // ---------------------------------------------------------------

    /// @notice Check Π e(P_i, Q_i) == 1_GT.
    /// @param pairs concatenation of (G1 point || G2 point) tuples, 384 bytes each.
    function pairingCheck(bytes memory pairs) internal view returns (bool) {
        require(pairs.length > 0 && pairs.length % 384 == 0, "BLS12381: invalid pairing input");
        (bool ok, bytes memory out) = PAIRING_CHECK.staticcall(pairs);
        require(ok && out.length == 32, "BLS12381: pairing precompile failed");
        return uint256(bytes32(out)) == 1;
    }
}
