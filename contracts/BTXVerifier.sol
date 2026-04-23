// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./lib/BLS12381.sol";
import "./lib/BLS12381Helpers.sol";

/// @title BTXVerifier — on-chain combiner and aggregate pairing checker for BTX threshold decryption.
///
/// @notice Stores the public BTX params produced by the JS trusted setup:
///          - h_powers:       { h_i = [[τ^i]]_2 }_{i ∈ [1, 2·Bmax]}, with h_{Bmax+1} stored as
///                            256 zero bytes (the punctured middle power).
///          - pkCommitments: { pk_j^i = [[τ^i_j]]_2 }_{j ∈ [0, N), i ∈ [1, Bmax]}.
///          - omega:         evaluation domain ω_j ∈ Fr, length N.
///
/// Decryptor nodes submit σ_j via `submitShare`. Any caller can then invoke
/// `combineAndVerify` with a chosen subset V (0-indexed into the N nodes) and
/// the list of ct_1 values for the epoch. The contract:
///   1. Combines σ = Σ_{j ∈ V} L_j(0) · σ_j  via G1MSM.
///   2. Runs a single aggregate pairing check:
///        Σ_{l ∈ U} e(ct_{l,1}, h_l)  ⋅  e(σ, -G_2)  ?=  1_GT.
///      Failure → revert.  Success → emit BatchVerified and return σ.
contract BTXVerifier {
    uint8 public immutable N;
    uint8 public immutable T_PLUS_1;  // minimum shares needed (t + 1)
    uint256 public immutable BMAX;

    // h_i for i ∈ [1, 2·Bmax]. h_powers[i-1] is the 256-byte EIP-2537 encoding.
    bytes[] public h_powers;
    // pk_j^i for j ∈ [0, N), i ∈ [1, Bmax]. pkCommitments[j][i-1].
    bytes[][] public pkCommitments;
    // Evaluation domain ω_j ∈ Fr. omega[j] is stored as uint256 < FR_ORDER.
    uint256[] public omega;

    // nodeId (0-indexed) → authorized submitter address.
    mapping(uint8 => address) public nodeAddresses;

    struct EpochShares {
        mapping(uint8 => bytes) sigma;        // nodeId → σ_j (128 bytes)
        mapping(uint8 => bool) submitted;
        bytes combinedSigma;                   // set after combineAndVerify
        bool verified;
        uint8 shareCount;
    }
    mapping(uint256 => EpochShares) private epochs;

    event ShareSubmitted(uint256 indexed epochId, uint8 indexed nodeId);
    event BatchVerified(uint256 indexed epochId, uint8[] chosenV);

    constructor(
        uint8 _N,
        uint8 _tPlus1,
        uint256 _Bmax,
        bytes[] memory _h_powers,
        bytes[][] memory _pkCommitments,
        uint256[] memory _omega,
        address[] memory _nodeAddresses
    ) {
        require(_N >= 2, "BTXVerifier: N < 2");
        require(_tPlus1 >= 1 && _tPlus1 <= _N, "BTXVerifier: bad tPlus1");
        require(_Bmax >= 1, "BTXVerifier: bad Bmax");
        require(_h_powers.length == 2 * _Bmax, "BTXVerifier: bad h_powers length");
        require(_pkCommitments.length == _N, "BTXVerifier: bad pk outer length");
        require(_omega.length == _N, "BTXVerifier: bad omega length");
        require(_nodeAddresses.length == _N, "BTXVerifier: bad node addrs length");

        N = _N;
        T_PLUS_1 = _tPlus1;
        BMAX = _Bmax;

        for (uint256 i = 0; i < _h_powers.length; i++) {
            require(_h_powers[i].length == 256, "BTXVerifier: h_powers[i] length");
            h_powers.push(_h_powers[i]);
        }

        for (uint8 j = 0; j < _N; j++) {
            require(_pkCommitments[j].length == _Bmax, "BTXVerifier: bad pk inner length");
            bytes[] memory pkj = new bytes[](_Bmax);
            for (uint256 i = 0; i < _Bmax; i++) {
                require(_pkCommitments[j][i].length == 256, "BTXVerifier: pk entry length");
                pkj[i] = _pkCommitments[j][i];
            }
            pkCommitments.push(pkj);

            require(_omega[j] != 0 && _omega[j] < BLS12381.FR_ORDER, "BTXVerifier: bad omega");
            omega.push(_omega[j]);

            nodeAddresses[j] = _nodeAddresses[j];
        }
    }

    // ------------------------------------------------------------------
    // Share submission
    // ------------------------------------------------------------------

    function submitShare(
        uint256 epochId,
        uint8 nodeId,
        bytes calldata sigma_j
    ) external {
        require(nodeId < N, "BTXVerifier: bad nodeId");
        require(msg.sender == nodeAddresses[nodeId], "BTXVerifier: unauthorized");
        require(sigma_j.length == 128, "BTXVerifier: bad sigma length");

        EpochShares storage es = epochs[epochId];
        require(!es.verified, "BTXVerifier: already verified");
        require(!es.submitted[nodeId], "BTXVerifier: duplicate");

        es.sigma[nodeId] = sigma_j;
        es.submitted[nodeId] = true;
        es.shareCount += 1;
        emit ShareSubmitted(epochId, nodeId);
    }

    function hasSubmitted(uint256 epochId, uint8 nodeId) external view returns (bool) {
        return epochs[epochId].submitted[nodeId];
    }

    function getShare(uint256 epochId, uint8 nodeId) external view returns (bytes memory) {
        return epochs[epochId].sigma[nodeId];
    }

    function isVerified(uint256 epochId) external view returns (bool) {
        return epochs[epochId].verified;
    }

    function combinedSigmaOf(uint256 epochId) external view returns (bytes memory) {
        return epochs[epochId].combinedSigma;
    }

    // ------------------------------------------------------------------
    // Combine + aggregate pairing check
    // ------------------------------------------------------------------

    /// @notice Combine σ_j's for V and verify via aggregate pairing. Reverts on failure.
    /// @param epochId     epoch identifier.
    /// @param V           0-indexed nodeIds with |V| == T_PLUS_1.
    /// @param ct_1_list   for l ∈ U, the EIP-2537 128-byte G1 ciphertext ct_{l,1}.
    ///                    Ordered so that ct_1_list[i] corresponds to U[i].
    /// @param U           1-indexed slot numbers (into h_powers: h_{U[i]}).
    /// @return combinedSigma  the recovered G1 element Σ L_j · σ_j.
    function combineAndVerify(
        uint256 epochId,
        uint8[] calldata V,
        bytes[] calldata ct_1_list,
        uint256[] calldata U
    ) external returns (bytes memory combinedSigma) {
        require(V.length == T_PLUS_1, "BTXVerifier: V size");
        require(ct_1_list.length == U.length && U.length > 0, "BTXVerifier: U length");

        EpochShares storage es = epochs[epochId];
        require(!es.verified, "BTXVerifier: already verified");

        // 1. Gather σ_j's for V and compute Lagrange coefficients at X=0.
        bytes[] memory points = new bytes[](V.length);
        bytes32[] memory L = lagrangeAt0(V);
        for (uint256 i = 0; i < V.length; i++) {
            require(es.submitted[V[i]], "BTXVerifier: missing share");
            points[i] = es.sigma[V[i]];
        }

        // 2. σ = Σ L_j · σ_j via single G1MSM call.
        bytes memory msmInput = BLS12381Helpers.packG1MSM(points, L);
        combinedSigma = BLS12381.g1MSM(msmInput);

        // 3. Aggregate pairing check:
        //      Σ_l e(ct_l, h_l) · e(σ, -G_2)  ==  1_GT
        bytes[] memory g1s = new bytes[](U.length + 1);
        bytes[] memory g2s = new bytes[](U.length + 1);
        for (uint256 i = 0; i < U.length; i++) {
            uint256 l = U[i];
            require(l >= 1 && l <= 2 * BMAX && l != BMAX + 1, "BTXVerifier: bad U index");
            require(ct_1_list[i].length == 128, "BTXVerifier: ct_1 length");
            g1s[i] = ct_1_list[i];
            g2s[i] = h_powers[l - 1];
        }
        g1s[U.length] = combinedSigma;
        g2s[U.length] = BLS12381.G2_GENERATOR_NEG();

        bytes memory pairingInput = BLS12381Helpers.packPairingCheck(g1s, g2s);
        bool ok = BLS12381.pairingCheck(pairingInput);
        require(ok, "BTXVerifier: pairing check failed");

        es.combinedSigma = combinedSigma;
        es.verified = true;
        emit BatchVerified(epochId, V);
    }

    // ------------------------------------------------------------------
    // Lagrange
    // ------------------------------------------------------------------

    /// @dev L_j(0) = Π_{k ∈ V, k ≠ j} (-ω_k) / (ω_j - ω_k)  mod FR_ORDER
    function lagrangeAt0(uint8[] calldata V) public view returns (bytes32[] memory L) {
        uint256 p = BLS12381.FR_ORDER;
        L = new bytes32[](V.length);
        for (uint256 i = 0; i < V.length; i++) {
            uint256 omegaJ = omega[V[i]];
            uint256 num = 1;
            uint256 den = 1;
            for (uint256 k = 0; k < V.length; k++) {
                if (k == i) continue;
                uint256 omegaK = omega[V[k]];
                num = mulmod(num, p - omegaK, p);
                uint256 diff = addmod(omegaJ, p - omegaK, p);
                require(diff != 0, "BTXVerifier: duplicate omega");
                den = mulmod(den, diff, p);
            }
            uint256 denInv = _modInverse(den, p);
            L[i] = bytes32(mulmod(num, denInv, p));
        }
    }

    /// @dev Fermat's little theorem: a^(p-2) mod p, p prime.
    function _modInverse(uint256 a, uint256 p) internal pure returns (uint256) {
        require(a != 0, "BTXVerifier: zero inverse");
        uint256 result = 1;
        uint256 base = a % p;
        uint256 exp = p - 2;
        while (exp > 0) {
            if (exp & 1 == 1) result = mulmod(result, base, p);
            exp >>= 1;
            base = mulmod(base, base, p);
        }
        return result;
    }
}
