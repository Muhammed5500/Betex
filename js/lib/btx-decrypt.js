// Single-server BTX decryption (Paper Figure 2 — BDec1 + BDec2).
//
// BDec1: compute succinct batch key σ from sk = τ
//   σ = Σ_{ℓ ∈ U} τ^ℓ · ct_{ℓ,1}     ∈ G1
//
// BDec2: per-slot recovery via punctured CRS
//   β_ℓ = σ ⋄ h_{Bmax-ℓ+1}            ∈ GT
//   γ_ℓ = Σ_{i ∈ U, i≠ℓ} ct_{i,1} ⋄ h_{Bmax-ℓ+i+1}   (naive O(B²) pairings)
//   m_ℓ = ct_{ℓ,2} / (β_ℓ / γ_ℓ)       (paper additive → Fp12 divisions)
//
// Faz 1 uses the naive cross-term. FFT acceleration (Paper §6) is Faz 2.

import { Fp12, g1MSM, pairing, powerTable } from './bls.js';
import { schnorrVerify } from './schnorr.js';

/**
 * BDec1 — compute the batch key σ.
 * @param {Array<{ct_1: any, ct_2: any, pi: any}>} ciphertexts
 * @param {bigint} sk      = τ
 * @param {number} Bmax
 * @returns {{sigma: any, U: number[]}} U is 1-indexed list of valid slots.
 */
export function bdec1(ciphertexts, sk, Bmax) {
  const B = ciphertexts.length;
  if (B > Bmax) throw new Error(`bdec1: B=${B} exceeds Bmax=${Bmax}`);

  // Filter by NIZK. U holds 1-based indices, matching paper.
  const U = [];
  for (let l = 1; l <= B; l++) {
    const ct = ciphertexts[l - 1];
    if (schnorrVerify(ct.ct_1, ct.pi)) U.push(l);
  }

  if (U.length === 0) {
    // Nothing to aggregate. Caller will return all-null messages.
    return { sigma: null, U };
  }

  // σ = Σ_{ℓ ∈ U} τ^ℓ · ct_{ℓ,1}. powers[l-1] = τ^l.
  const powers = powerTable(sk, B);
  const scalars = U.map((l) => powers[l - 1]);
  const points = U.map((l) => ciphertexts[l - 1].ct_1);
  const sigma = g1MSM(scalars, points);

  return { sigma, U };
}

/**
 * BDec2 — recover each valid slot's plaintext m_ℓ.
 * @param {any} sigma
 * @param {number[]} U
 * @param {Array} ciphertexts
 * @param {Array} dk          1-indexed, dk[Bmax+1] === null
 * @param {number} Bmax
 * @returns {Array<any|null>}  length B; null at invalid (non-U) slots
 */
export function bdec2(sigma, U, ciphertexts, dk, Bmax) {
  const B = ciphertexts.length;
  const messages = new Array(B).fill(null);
  if (U.length === 0) return messages;

  const uSet = new Set(U);

  for (const l of U) {
    // β_ℓ = σ ⋄ h_{Bmax-ℓ+1}
    const betaIdx = Bmax - l + 1;
    if (betaIdx < 1 || betaIdx > 2 * Bmax || betaIdx === Bmax + 1) {
      throw new Error(`bdec2: invalid β index ${betaIdx} for ℓ=${l}, Bmax=${Bmax}`);
    }
    const beta_l = pairing(sigma, dk[betaIdx]);

    // γ_ℓ = Σ_{i ∈ U, i≠ℓ} ct_{i,1} ⋄ h_{Bmax-ℓ+i+1}
    let gamma_l = Fp12.ONE;
    for (const i of U) {
      if (i === l) continue;
      const gammaIdx = Bmax - l + i + 1;
      if (gammaIdx === Bmax + 1) {
        // Would only happen if i === l, which we skipped. Guard against miscalculated Bmax/B.
        throw new Error(`bdec2: hit punctured power at i=${i}, l=${l}`);
      }
      if (gammaIdx < 1 || gammaIdx > 2 * Bmax) {
        throw new Error(`bdec2: γ index ${gammaIdx} out of range for ℓ=${l}, i=${i}`);
      }
      const term = pairing(ciphertexts[i - 1].ct_1, dk[gammaIdx]);
      gamma_l = Fp12.mul(gamma_l, term);
    }

    // pad_ℓ = β_ℓ / γ_ℓ     (GT division)
    const pad = Fp12.mul(beta_l, Fp12.inv(gamma_l));
    // m_ℓ = ct_{ℓ,2} / pad_ℓ
    const m = Fp12.mul(ciphertexts[l - 1].ct_2, Fp12.inv(pad));
    messages[l - 1] = m;
  }

  // Sanity: U referenced only valid indices.
  void uSet;
  return messages;
}

/**
 * Convenience: full BDec = BDec1 + BDec2.
 */
export function decrypt(ciphertexts, sk, dk, Bmax) {
  const { sigma, U } = bdec1(ciphertexts, sk, Bmax);
  if (!sigma) return new Array(ciphertexts.length).fill(null);
  return bdec2(sigma, U, ciphertexts, dk, Bmax);
}
