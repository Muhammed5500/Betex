// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../lib/BLS12381.sol";
import "../lib/BLS12381Helpers.sol";

/// @notice Thin wrapper that exposes BLS12381 library calls as external functions
///         so Hardhat tests can invoke them. Exists only for tests.
contract BLS12381TestHarness {
    function g1Generator() external pure returns (bytes memory) {
        return BLS12381.G1_GENERATOR();
    }

    function g2Generator() external pure returns (bytes memory) {
        return BLS12381.G2_GENERATOR();
    }

    function g2GeneratorNeg() external pure returns (bytes memory) {
        return BLS12381.G2_GENERATOR_NEG();
    }

    function g1Add(bytes memory a, bytes memory b) external view returns (bytes memory) {
        return BLS12381.g1Add(a, b);
    }

    function g1ScalarMul(bytes memory point, bytes32 scalar) external view returns (bytes memory) {
        return BLS12381.g1ScalarMul(point, scalar);
    }

    function g1MSM(bytes memory pairs) external view returns (bytes memory) {
        return BLS12381.g1MSM(pairs);
    }

    function g2Add(bytes memory a, bytes memory b) external view returns (bytes memory) {
        return BLS12381.g2Add(a, b);
    }

    function g2ScalarMul(bytes memory point, bytes32 scalar) external view returns (bytes memory) {
        return BLS12381.g2ScalarMul(point, scalar);
    }

    function g2MSM(bytes memory pairs) external view returns (bytes memory) {
        return BLS12381.g2MSM(pairs);
    }

    function pairingCheck(bytes memory pairs) external view returns (bool) {
        return BLS12381.pairingCheck(pairs);
    }

    function packPairingCheckAndVerify(bytes[] memory g1s, bytes[] memory g2s)
        external
        view
        returns (bool)
    {
        bytes memory input = BLS12381Helpers.packPairingCheck(g1s, g2s);
        return BLS12381.pairingCheck(input);
    }

    function gasG1Add(bytes memory a, bytes memory b) external view returns (bytes memory, uint256) {
        uint256 gasStart = gasleft();
        bytes memory result = BLS12381.g1Add(a, b);
        return (result, gasStart - gasleft());
    }

    function gasPairingCheck(bytes memory pairs) external view returns (bool, uint256) {
        uint256 gasStart = gasleft();
        bool result = BLS12381.pairingCheck(pairs);
        return (result, gasStart - gasleft());
    }
}
