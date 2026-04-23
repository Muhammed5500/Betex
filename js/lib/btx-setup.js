// Single-server BTX KeyGen (Paper Figure 2).
// Produces:
//   sk = τ
//   ek = [[τ^(Bmax+1)]]_T         (in GT)
//   dk = { h_i = [[τ^i]]_2 }_{i ∈ [2·Bmax] \ {Bmax+1}}   (punctured CRS in G2)
//
// dk is 1-indexed: dk[i] for i ∈ [1, 2·Bmax]. dk[0] is null (placeholder).
// dk[Bmax+1] is null — the punctured middle power that enables decryption.

import { G1, Fp12, pairing, randomFr, powerTable, g2Mul } from './bls.js';

/**
 * Generate single-server BTX keys.
 * @param {number} Bmax  max batch size
 * @returns {{tau: bigint, dk: Array, ek: any, Bmax: number}}
 */
export function keyGen(Bmax) {
  if (!Number.isInteger(Bmax) || Bmax < 1) {
    throw new Error(`keyGen: Bmax must be a positive integer, got ${Bmax}`);
  }

  const tau = randomFr();

  // [τ, τ², ..., τ^(2·Bmax)]; 0-indexed so powers[i-1] = τ^i.
  const powers = powerTable(tau, 2 * Bmax);

  // dk as a 1-indexed array. dk[0] and dk[Bmax+1] are null.
  const dk = new Array(2 * Bmax + 1).fill(null);
  for (let i = 1; i <= 2 * Bmax; i++) {
    if (i === Bmax + 1) continue;
    dk[i] = g2Mul(powers[i - 1]);
  }

  // ek = e(G_1, [[τ^(Bmax+1)]]_2). The bilinearity of pairing gives us
  // [[τ^(Bmax+1)]]_T = e(G_1, G_2)^(τ^(Bmax+1)), which is exactly what encryption needs.
  const tauMidG2 = g2Mul(powers[Bmax]); // τ^(Bmax+1)
  const ek = pairing(G1, tauMidG2);

  return { tau, dk, ek, Bmax };
}
