// Threshold BTX decryption (Paper §5.2 π-BDec1 + π-BDec2 + aggregate check).
//
// Per-server π-BDec1:
//   σ_j = Σ_{ℓ ∈ U} τ^ℓ_j · ct_{ℓ,1}     ∈ G1        (single G1 MSM; O(1) w.r.t. B in output)
//
// Combiner:
//   1. Verify each σ_j via aggregate pairing check (optimistic, paper §5 blue)
//   2. Pick V with |V| = t+1
//   3. σ = Σ_{j ∈ V} L_j · σ_j                                (Lagrange in exponent)
//   4. Run BDec2(σ, dk) from single-server module to recover m_ℓ's

import { G1, G2, G1_ZERO, Fp12, pairing, g1MSM, FR_ORDER } from './bls.js';
import { schnorrVerify } from './schnorr.js';
import { lagrange } from './shamir.js';
import { bdec2 } from './btx-decrypt.js';

// Precomputed once. -G_2 = G_2.negate() — used for aggregate-check trick.
const G2_NEG = G2.negate();

/**
 * Per-server partial decryption.
 * @param {Array} ciphertexts   array of {ct_1, ct_2, pi}
 * @param {bigint[]} sk_j        this server's share vector, length Bmax
 * @returns {{sigma_j: object|null, U: number[]}}  U is 1-indexed
 */
export function partialDecrypt(ciphertexts, sk_j) {
  const B = ciphertexts.length;

  const U = [];
  for (let l = 1; l <= B; l++) {
    const ct = ciphertexts[l - 1];
    if (schnorrVerify(ct.ct_1, ct.pi)) U.push(l);
  }

  if (U.length === 0) return { sigma_j: null, U };
  if (U[U.length - 1] > sk_j.length) {
    throw new Error(`partialDecrypt: U has index ${U[U.length - 1]} > Bmax=${sk_j.length}`);
  }

  // σ_j = Σ_{ℓ ∈ U} sk_j[ℓ-1] · ct_{ℓ,1}
  const scalars = U.map((l) => sk_j[l - 1]);
  const points = U.map((l) => ciphertexts[l - 1].ct_1);
  const sigma_j = g1MSM(scalars, points);
  return { sigma_j, U };
}

/**
 * Verify a single σ_j against its public commitments pk_j via aggregate pairing.
 *
 *   Σ_{ℓ ∈ U} e(ct_{ℓ,1}, pk_j^ℓ)  ==  e(σ_j, G_2)
 *
 * Rewritten as the pairing-product check expected by EIP-2537:
 *   Σ_{ℓ} e(ct_{ℓ,1}, pk_j^ℓ) · e(σ_j, -G_2)  ==  1_GT
 *
 * @param {object} sigma_j
 * @param {number[]} U
 * @param {Array} ciphertexts
 * @param {Array} pk_j            length Bmax, pk_j[ℓ-1] = [[τ^ℓ_j]]_2
 * @returns {boolean}
 */
export function verifyShare(sigma_j, U, ciphertexts, pk_j) {
  if (!sigma_j) return false;
  if (U.length === 0) return sigma_j.is0();

  let product = pairing(sigma_j, G2_NEG);
  for (const l of U) {
    const term = pairing(ciphertexts[l - 1].ct_1, pk_j[l - 1]);
    product = Fp12.mul(product, term);
  }
  return Fp12.eql(product, Fp12.ONE);
}

/**
 * Combine partial decryptions into full message recovery.
 *
 * @param {Array<{sigma_j: object, U: number[]}|null>} partials   length N
 * @param {number[]} V              0-indexed subset of [0, N) with |V| >= t+1 candidate nodes
 * @param {Array} ciphertexts
 * @param {Array} dk                1-indexed, dk[Bmax+1] === null
 * @param {Array<Array>} pkCommitments  [N][Bmax] G2 points
 * @param {bigint[]} omega
 * @param {number} Bmax
 * @param {number} tPlus1           = t+1 (minimum valid shares needed)
 * @returns {{messages: Array, U: number[], chosenV: number[], sigma: object}}
 */
export function combine(partials, V, ciphertexts, dk, pkCommitments, omega, Bmax, tPlus1) {
  if (!Array.isArray(V) || V.length < tPlus1) {
    throw new Error(`combine: V has ${V?.length ?? 0} candidates, need at least t+1=${tPlus1}`);
  }

  // 1. Verify each candidate share; drop bad ones.
  const validV = [];
  let U = null;
  for (const j of V) {
    const p = partials[j];
    if (!p || !p.sigma_j) continue;
    if (verifyShare(p.sigma_j, p.U, ciphertexts, pkCommitments[j])) {
      validV.push(j);
      if (U === null) U = p.U;
    }
  }

  if (validV.length < tPlus1) {
    throw new Error(
      `combine: only ${validV.length} valid shares out of ${V.length} candidates, need ${tPlus1}`,
    );
  }
  const chosenV = validV.slice(0, tPlus1);

  // 2. Lagrange-combine σ_j's in G1.
  const L = lagrange(chosenV, omega);
  let sigma = G1_ZERO;
  for (let i = 0; i < chosenV.length; i++) {
    const s = ((L[i] % FR_ORDER) + FR_ORDER) % FR_ORDER;
    if (s === 0n) continue;
    sigma = sigma.add(partials[chosenV[i]].sigma_j.multiply(s));
  }

  // 3. Run BDec2 with σ to get the plaintext GT elements.
  const messages = bdec2(sigma, U, ciphertexts, dk, Bmax);

  return { messages, U, chosenV, sigma };
}
