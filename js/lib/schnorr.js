// Schnorr DL NIZK for the statement "I know r such that ct_1 = r · G_1".
// Fiat–Shamir with SHA-256 and a fixed domain separator. Byte-for-byte compatible
// with the Solidity verifier: both sides hash the EIP-2537 128-byte uncompressed G1
// encoding (compressed form is unavailable at the precompile layer).

import { G1, FR_ORDER, randomFr, hashToFr } from './bls.js';
import { g1ToBytes } from './eip2537.js';

const DOMAIN = new TextEncoder().encode('BTX-SCHNORR-V1');

/**
 * Prove knowledge of r such that ct_1 = r · G_1.
 * @param {bigint} r            witness
 * @param {object} ct_1         G1 point = r · G_1
 * @returns {{R: object, s: bigint}}
 */
export function schnorrProve(r, ct_1) {
  const k = randomFr();
  const R = G1.multiply(k);

  const c = hashToFr(
    DOMAIN,
    g1ToBytes(G1),
    g1ToBytes(ct_1),
    g1ToBytes(R),
  );

  const rNorm = ((r % FR_ORDER) + FR_ORDER) % FR_ORDER;
  const s = (k + c * rNorm) % FR_ORDER;
  return { R, s };
}

/**
 * Verify Schnorr proof.
 * @param {object} ct_1
 * @param {{R: object, s: bigint}} pi
 * @returns {boolean}
 */
export function schnorrVerify(ct_1, pi) {
  if (!pi || !pi.R || typeof pi.s !== 'bigint') return false;

  const c = hashToFr(
    DOMAIN,
    g1ToBytes(G1),
    g1ToBytes(ct_1),
    g1ToBytes(pi.R),
  );

  const sNorm = ((pi.s % FR_ORDER) + FR_ORDER) % FR_ORDER;
  if (sNorm === 0n) return false;

  const lhs = G1.multiply(sNorm);
  const cNorm = ((c % FR_ORDER) + FR_ORDER) % FR_ORDER;
  const rhs = cNorm === 0n ? pi.R : pi.R.add(ct_1.multiply(cNorm));
  return lhs.equals(rhs);
}

export const SCHNORR_DOMAIN = 'BTX-SCHNORR-V1';
