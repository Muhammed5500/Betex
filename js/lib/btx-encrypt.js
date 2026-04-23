// BTX encryption (Paper Figure 2 — Enc).
//   r ←$ Fr
//   ct_1 = [[r]]_1  = r · G_1
//   ct_2 = m · ek^r          (paper additive GT → multiplicative Fp12)
//   π    = SchnorrProve(r, ct_1)
// Returns (ct_1, ct_2, π).

import { Fp12, g1Mul, randomFr } from './bls.js';
import { schnorrProve } from './schnorr.js';

/**
 * Encrypt a GT-element message m under encryption key ek.
 * @param {any} ek  GT element [[τ^(Bmax+1)]]_T
 * @param {any} m   GT message
 * @returns {{ct_1: object, ct_2: any, pi: {R: object, s: bigint}}}
 */
export function encrypt(ek, m) {
  const r = randomFr();
  const ct_1 = g1Mul(r);
  const ct_2 = Fp12.mul(m, Fp12.pow(ek, r));
  const pi = schnorrProve(r, ct_1);
  return { ct_1, ct_2, pi };
}
