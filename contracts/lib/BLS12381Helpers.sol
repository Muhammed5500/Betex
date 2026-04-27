// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @title Packing helpers for EIP-2537 precompile inputs.
library BLS12381Helpers {
    /// @notice Pack k × (128-byte G1 point, 32-byte scalar) into a single MSM buffer.
    function packG1MSM(bytes[] memory points, bytes32[] memory scalars)
        internal
        pure
        returns (bytes memory)
    {
        require(points.length == scalars.length, "BLS12381Helpers: length mismatch");
        bytes memory out = new bytes(points.length * 160);
        for (uint256 i = 0; i < points.length; i++) {
            require(points[i].length == 128, "BLS12381Helpers: invalid G1 length");
            for (uint256 j = 0; j < 128; j++) out[i * 160 + j] = points[i][j];
            for (uint256 j = 0; j < 32; j++) out[i * 160 + 128 + j] = scalars[i][j];
        }
        return out;
    }

    /// @notice Pack k × (128-byte G1, 256-byte G2) pairs for pairing check.
    function packPairingCheck(bytes[] memory g1s, bytes[] memory g2s)
        internal
        pure
        returns (bytes memory)
    {
        require(g1s.length == g2s.length, "BLS12381Helpers: length mismatch");
        bytes memory out = new bytes(g1s.length * 384);
        for (uint256 i = 0; i < g1s.length; i++) {
            require(g1s[i].length == 128, "BLS12381Helpers: invalid G1 length");
            require(g2s[i].length == 256, "BLS12381Helpers: invalid G2 length");
            for (uint256 j = 0; j < 128; j++) out[i * 384 + j] = g1s[i][j];
            for (uint256 j = 0; j < 256; j++) out[i * 384 + 128 + j] = g2s[i][j];
        }
        return out;
    }
}
